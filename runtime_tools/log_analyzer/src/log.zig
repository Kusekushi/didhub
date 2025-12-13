const std = @import("std");

pub const Allocator = std.mem.Allocator;

pub const LogLevel = enum(u8) {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,

    pub inline fn color(self: LogLevel) []const u8 {
        return switch (self) {
            .Error => "\x1b[31m", // Red
            .Warn => "\x1b[33m", // Yellow
            .Info => "\x1b[32m", // Green
            .Debug => "\x1b[34m", // Blue
        };
    }

    pub inline fn name(self: LogLevel) []const u8 {
        return switch (self) {
            .Debug => "Debug",
            .Info => "Info",
            .Warn => "Warn",
            .Error => "Error",
        };
    }
};

pub const LogEntry = struct {
    timestamp: []const u8,
    level: LogLevel,
    message: []const u8,
    source: ?[]const u8,

    pub fn deinit(self: *const LogEntry, allocator: Allocator) void {
        allocator.free(self.timestamp);
        allocator.free(self.message);
        if (self.source) |s| allocator.free(s);
    }
};

pub const ErrorItem = struct {
    message: []const u8,
    count: usize,

    pub fn compareDesc(_: void, a: ErrorItem, b: ErrorItem) bool {
        return a.count > b.count;
    }
};

// Pre-computed hash values for level strings (FNV-1a)
const HASH_ERROR: u32 = hashLevel("[ERROR]");
const HASH_WARN: u32 = hashLevel("[WARN]");
const HASH_INFO: u32 = hashLevel("[INFO]");
const HASH_DEBUG: u32 = hashLevel("[DEBUG]");

fn hashLevel(comptime s: []const u8) u32 {
    var h: u32 = 2166136261;
    for (s) |c| {
        h ^= c;
        h *%= 16777619;
    }
    return h;
}

/// Fast hash of a slice at runtime
inline fn hashSlice(s: []const u8) u32 {
    var h: u32 = 2166136261;
    for (s) |c| {
        h ^= c;
        h *%= 16777619;
    }
    return h;
}

/// Find '[' using vectorized search when possible
inline fn findBracket(line: []const u8) ?usize {
    // For short lines, linear search is faster
    if (line.len < 32) {
        return std.mem.indexOfScalar(u8, line, '[');
    }
    return std.mem.indexOfScalar(u8, line, '[');
}

/// Extract a field value from JSON log line
fn extractJsonField(line: []const u8, field: []const u8) ?[]const u8 {
    var field_pattern_buf: [32]u8 = undefined;
    const field_pattern = std.fmt.bufPrint(&field_pattern_buf, "\"{s}\":", .{field}) catch return null;

    const field_start = std.mem.indexOf(u8, line, field_pattern) orelse return null;
    const value_start_pos = field_start + field_pattern.len;
    const quote_start = value_start_pos;
    const quote_end = std.mem.indexOfScalarPos(u8, line, quote_start + 1, '"') orelse return null;

    return line[quote_start + 1 .. quote_end];
}

/// Parse log level from JSON log line
fn parseJsonLogLevel(line: []const u8) ?LogLevel {
    const category = extractJsonField(line, "category") orelse return null;

    // Map category to log level
    if (std.mem.eql(u8, category, "error")) return .Error;
    if (std.mem.eql(u8, category, "warn")) return .Warn;
    if (std.mem.eql(u8, category, "info")) return .Info;
    if (std.mem.eql(u8, category, "debug")) return .Debug;
    if (std.mem.eql(u8, category, "audit")) return .Info; // Assume audit is info level

    return null;
}

/// Parse log level from a line
pub fn parseLogLevel(line: []const u8) ?LogLevel {
    // First try JSON format
    if (line.len > 0 and line[0] == '{') {
        return parseJsonLogLevel(line);
    }

    // Fall back to bracket format
    const level_start = findBracket(line) orelse return null;

    // Quick bounds check - minimum level string is "[INFO]" (6 chars)
    if (level_start + 6 > line.len) return null;

    // Find closing bracket - it's always within 7 chars for valid levels
    const search_end = @min(level_start + 8, line.len);
    const level_end = std.mem.indexOfScalarPos(u8, line, level_start + 1, ']') orelse return null;
    if (level_end >= search_end) return null;

    const level_str = line[level_start .. level_end + 1];

    // Use hash comparison for faster matching
    const h = hashSlice(level_str);
    return switch (h) {
        HASH_ERROR => if (std.mem.eql(u8, level_str, "[ERROR]")) .Error else null,
        HASH_WARN => if (std.mem.eql(u8, level_str, "[WARN]")) .Warn else null,
        HASH_INFO => if (std.mem.eql(u8, level_str, "[INFO]")) .Info else null,
        HASH_DEBUG => if (std.mem.eql(u8, level_str, "[DEBUG]")) .Debug else null,
        else => null,
    };
}

/// Parse log level with position info to avoid redundant searching
pub const ParseResult = struct {
    level: LogLevel,
    level_start: usize,
    level_end: usize,
};

pub fn parseLogLevelWithPos(line: []const u8) ?ParseResult {
    // First try JSON format
    if (line.len > 0 and line[0] == '{') {
        const level = parseJsonLogLevel(line) orelse return null;
        // For JSON, level_start and level_end point to the category field
        const field_start = std.mem.indexOf(u8, line, "\"category\":") orelse return null;
        const value_start_pos = field_start + "\"category\":".len;
        const quote_start = value_start_pos;
        const quote_end = std.mem.indexOfScalarPos(u8, line, quote_start + 1, '"') orelse return null;
        return ParseResult{
            .level = level,
            .level_start = quote_start + 1,
            .level_end = quote_end,
        };
    }

    // Fall back to bracket format
    const level_start = findBracket(line) orelse return null;
    if (level_start + 6 > line.len) return null;

    const search_end = @min(level_start + 8, line.len);
    const level_end = std.mem.indexOfScalarPos(u8, line, level_start + 1, ']') orelse return null;
    if (level_end >= search_end) return null;

    const level_str = line[level_start .. level_end + 1];
    const h = hashSlice(level_str);

    const level: ?LogLevel = switch (h) {
        HASH_ERROR => if (std.mem.eql(u8, level_str, "[ERROR]")) .Error else null,
        HASH_WARN => if (std.mem.eql(u8, level_str, "[WARN]")) .Warn else null,
        HASH_INFO => if (std.mem.eql(u8, level_str, "[INFO]")) .Info else null,
        HASH_DEBUG => if (std.mem.eql(u8, level_str, "[DEBUG]")) .Debug else null,
        else => null,
    };

    return if (level) |l| .{
        .level = l,
        .level_start = level_start,
        .level_end = level_end,
    } else null;
}

/// Log line parser - reuse position info from parseLogLevel
pub fn parse_log_line(line: []const u8, allocator: Allocator) !?LogEntry {
    const result = parseLogLevelWithPos(line) orelse return null;

    var timestamp: []const u8 = undefined;
    var message: []const u8 = undefined;

    if (line.len > 0 and line[0] == '{') {
        // JSON format
        timestamp = extractJsonField(line, "timestamp") orelse "";
        message = extractJsonField(line, "message") orelse "";
    } else {
        // Bracket format
        timestamp = std.mem.trimRight(u8, line[0..result.level_start], " ");
        const message_start = @min(result.level_end + 2, line.len);
        message = if (message_start < line.len)
            std.mem.trim(u8, line[message_start..], " \n\r")
        else
            "";
    }

    return LogEntry{
        .timestamp = try allocator.dupe(u8, timestamp),
        .level = result.level,
        .message = try allocator.dupe(u8, message),
        .source = null,
    };
}

pub const LogEntryView = struct {
    timestamp: []const u8,
    level: LogLevel,
    message: []const u8,
};

pub fn parseLogLineView(line: []const u8) ?LogEntryView {
    const result = parseLogLevelWithPos(line) orelse return null;

    var timestamp: []const u8 = undefined;
    var message: []const u8 = undefined;

    if (line.len > 0 and line[0] == '{') {
        // JSON format
        timestamp = extractJsonField(line, "timestamp") orelse "";
        message = extractJsonField(line, "message") orelse "";
    } else {
        // Bracket format
        timestamp = std.mem.trimRight(u8, line[0..result.level_start], " ");
        const message_start = @min(result.level_end + 2, line.len);
        message = if (message_start < line.len)
            std.mem.trim(u8, line[message_start..], " \n\r")
        else
            "";
    }

    return LogEntryView{
        .timestamp = timestamp,
        .level = result.level,
        .message = message,
    };
}
