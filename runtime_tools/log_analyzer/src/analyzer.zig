const std = @import("std");
const log = @import("log.zig");
const reader = @import("reader.zig");

pub const Allocator = std.mem.Allocator;

pub const AnalysisResult = struct {
    total_logs: usize,
    error_count: usize,
    warn_count: usize,
    info_count: usize,
    debug_count: usize,
    top_errors: std.ArrayList(log.ErrorItem),

    pub fn deinit(self: *AnalysisResult, allocator: Allocator) void {
        for (self.top_errors.items) |item| {
            allocator.free(item.message);
        }
        self.top_errors.deinit(allocator);
    }
};

const TopErrorTracker = struct {
    const Entry = struct {
        message: []const u8,
        count: usize,
        hash: u64,
    };

    map: std.AutoHashMap(u64, Entry),
    allocator: Allocator,
    max_items: usize,

    pub fn init(allocator: Allocator, max_items: usize) TopErrorTracker {
        return .{
            .map = std.AutoHashMap(u64, Entry).init(allocator),
            .allocator = allocator,
            .max_items = max_items,
        };
    }

    pub fn deinit(self: *TopErrorTracker) void {
        var iter = self.map.valueIterator();
        while (iter.next()) |entry| {
            self.allocator.free(entry.message);
        }
        self.map.deinit();
    }

    fn hashMessage(msg: []const u8) u64 {
        return std.hash.Wyhash.hash(0, msg);
    }

    pub fn add(self: *TopErrorTracker, message: []const u8) !void {
        const hash = hashMessage(message);

        if (self.map.getPtr(hash)) |entry| {
            entry.count += 1;
        } else {
            const owned_msg = try self.allocator.dupe(u8, message);
            errdefer self.allocator.free(owned_msg);
            try self.map.put(hash, .{
                .message = owned_msg,
                .count = 1,
                .hash = hash,
            });
        }
    }

    pub fn toSortedList(self: *TopErrorTracker, allocator: Allocator) !std.ArrayList(log.ErrorItem) {
        var result = try std.ArrayList(log.ErrorItem).initCapacity(allocator, self.map.count());
        errdefer {
            for (result.items) |item| {
                allocator.free(item.message);
            }
            result.deinit(allocator);
        }

        var iter = self.map.valueIterator();
        while (iter.next()) |entry| {
            result.appendAssumeCapacity(.{
                .message = try allocator.dupe(u8, entry.message),
                .count = entry.count,
            });
        }

        std.mem.sort(log.ErrorItem, result.items, {}, log.ErrorItem.compareDesc);

        if (result.items.len > self.max_items) {
            for (result.items[self.max_items..]) |item| {
                allocator.free(item.message);
            }
            result.shrinkRetainingCapacity(self.max_items);
        }

        return result;
    }
};

pub fn analyze_logs_streaming(reader_ptr: *reader.StreamingLogReader, allocator: Allocator) !AnalysisResult {
    const counts = reader_ptr.getLevelCounts();

    var result = AnalysisResult{
        .total_logs = reader_ptr.count(),
        .error_count = counts.err,
        .warn_count = counts.warn,
        .info_count = counts.info,
        .debug_count = counts.debug,
        .top_errors = .empty,
    };

    if (counts.err == 0) {
        return result;
    }

    var error_tracker = TopErrorTracker.init(allocator, 10);
    defer error_tracker.deinit();

    var error_iter = reader_ptr.iterateErrors();
    while (try error_iter.next()) |entry| {
        defer entry.deinit(allocator);
        try error_tracker.add(entry.message);
    }

    result.top_errors = try error_tracker.toSortedList(allocator);
    return result;
}

/// Quick analysis that only counts levels (no error message tracking)
pub fn analyze_logs_quick(reader_ptr: *reader.StreamingLogReader) AnalysisResult {
    const counts = reader_ptr.getLevelCounts();
    return AnalysisResult{
        .total_logs = reader_ptr.count(),
        .error_count = counts.err,
        .warn_count = counts.warn,
        .info_count = counts.info,
        .debug_count = counts.debug,
        .top_errors = .empty,
    };
}

pub fn print_analysis(result: AnalysisResult) void {
    std.debug.print(
        \\Log Analysis Report
        \\===================
        \\Total logs: {}
        \\Errors: {}
        \\Warnings: {}
        \\Info: {}
        \\Debug: {}
        \\
        \\Top Errors:
        \\
    , .{
        result.total_logs,
        result.error_count,
        result.warn_count,
        result.info_count,
        result.debug_count,
    });

    for (result.top_errors.items) |error_item| {
        std.debug.print("  '{s}': {}\n", .{ error_item.message, error_item.count });
    }
}

/// Generate JSON output for analysis results
pub fn to_json(result: AnalysisResult, allocator: Allocator) ![]u8 {
    var buffer: std.ArrayList(u8) = .empty;
    errdefer buffer.deinit(allocator);

    const writer = buffer.writer(allocator);

    try writer.print(
        \\{{"total_logs":{},"error_count":{},"warn_count":{},"info_count":{},"debug_count":{},"top_errors":[
    , .{
        result.total_logs,
        result.error_count,
        result.warn_count,
        result.info_count,
        result.debug_count,
    });

    for (result.top_errors.items, 0..) |item, i| {
        if (i > 0) try writer.writeAll(",");
        try writer.print("{{\"message\":\"{s}\",\"count\":{}}}", .{ item.message, item.count });
    }

    try writer.writeAll("]}");
    return buffer.toOwnedSlice(allocator);
}
