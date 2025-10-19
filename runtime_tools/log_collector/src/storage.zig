const std = @import("std");
const types = @import("types.zig");

// Default storage path as comptime constant
/// TODO: On linux it should be "/var/logs/didhub", on Windows "./" or "%APPDATA%/DIDAlterHub/logs"
const default_storage_path = "./var/logs/didhub";

pub fn resolve_storage(arg: []const u8, allocator: types.Allocator) anyerror![]const u8 {
    if (arg.len != 0) return try allocator.dupe(u8, arg);
    return std.process.getEnvVarOwned(allocator, "DIDHUB_LOG_STORAGE") catch
        try allocator.dupe(u8, default_storage_path);
}

pub fn ensure_storage_dir(path: []const u8) anyerror!void {
    try std.fs.cwd().makePath(path);
}

pub fn clear_log(path: []const u8) anyerror!void {
    var fs = std.fs.cwd();
    fs.deleteFile(path) catch |err| switch (err) {
        error.FileNotFound => {},
        else => return err,
    };
}

const max_lock_attempts = 100;
const initial_backoff_ms = 10;
const max_backoff_ms = 200;

pub fn acquire_lock(lock_path: []const u8) anyerror!void {
    var backoff_ms: u64 = initial_backoff_ms;
    var attempts: usize = 0;

    while (attempts < max_lock_attempts) : (attempts += 1) {
        if (std.fs.cwd().createFile(lock_path, .{ .exclusive = true })) |file| {
            file.close();
            return;
        } else |_| {
            // Lock exists, wait with exponential backoff
            std.Thread.sleep(backoff_ms * std.time.ns_per_ms);
            backoff_ms = @min(backoff_ms * 2, max_backoff_ms);
        }
    }
    return error.LockTimeout;
}

pub fn release_lock(lock_path: []const u8) void {
    _ = std.fs.cwd().deleteFile(lock_path) catch {};
}

// Hex lookup table for fast byte-to-hex conversion
const hex_chars = "0123456789abcdef";

pub fn gen_uuid_v4(allocator: types.Allocator) anyerror![]const u8 {
    var buf: [16]u8 = undefined;
    std.crypto.random.bytes(&buf);
    // Set version (4) and variant (RFC 4122)
    buf[6] = (buf[6] & 0x0F) | 0x40;
    buf[8] = (buf[8] & 0x3F) | 0x80;

    // Build UUID string directly using lookup table (faster than fmt)
    var out: [36]u8 = undefined;
    const positions = [_]struct { buf_idx: usize, out_idx: usize }{
        .{ .buf_idx = 0, .out_idx = 0 },   .{ .buf_idx = 1, .out_idx = 2 },
        .{ .buf_idx = 2, .out_idx = 4 },   .{ .buf_idx = 3, .out_idx = 6 },
        .{ .buf_idx = 4, .out_idx = 9 },   .{ .buf_idx = 5, .out_idx = 11 },
        .{ .buf_idx = 6, .out_idx = 14 },  .{ .buf_idx = 7, .out_idx = 16 },
        .{ .buf_idx = 8, .out_idx = 19 },  .{ .buf_idx = 9, .out_idx = 21 },
        .{ .buf_idx = 10, .out_idx = 24 }, .{ .buf_idx = 11, .out_idx = 26 },
        .{ .buf_idx = 12, .out_idx = 28 }, .{ .buf_idx = 13, .out_idx = 30 },
        .{ .buf_idx = 14, .out_idx = 32 }, .{ .buf_idx = 15, .out_idx = 34 },
    };

    inline for (positions) |p| {
        out[p.out_idx] = hex_chars[buf[p.buf_idx] >> 4];
        out[p.out_idx + 1] = hex_chars[buf[p.buf_idx] & 0x0F];
    }

    // Insert dashes at fixed positions
    out[8] = '-';
    out[13] = '-';
    out[18] = '-';
    out[23] = '-';

    return allocator.dupe(u8, &out);
}

pub fn timestamp_ms(allocator: types.Allocator) []const u8 {
    const ns = std.time.milliTimestamp();
    return std.fmt.allocPrint(allocator, "{d}", .{ns}) catch "0";
}

pub fn load_entries(path: []const u8, list: *std.ArrayList(types.LogEntry), allocator: types.Allocator) anyerror!void {
    const file = std.fs.cwd().openFile(path, .{}) catch |err| switch (err) {
        error.FileNotFound => return,
        else => return err,
    };
    defer file.close();

    const stat = try file.stat();
    const content = try allocator.alloc(u8, stat.size);
    defer allocator.free(content);
    const bytes_read = try file.readAll(content);

    var lines = std.mem.splitScalar(u8, content[0..bytes_read], '\n');
    while (lines.next()) |line| {
        if (line.len == 0) continue;
        const trimmed = std.mem.trim(u8, line, " \t\r");
        if (trimmed.len == 0) continue;

        const parsed = std.json.parseFromSlice(std.json.Value, allocator, trimmed, .{}) catch continue;
        defer parsed.deinit();

        const obj = &parsed.value.object;

        const id = (obj.get("id") orelse continue).string;
        const timestamp = (obj.get("timestamp") orelse continue).string;
        const category = (obj.get("category") orelse continue).string;
        const message = (obj.get("message") orelse continue).string;
        const source_val = obj.get("source");

        var metadata_str: ?[]const u8 = null;
        if (std.mem.indexOf(u8, trimmed, "\"metadata\":")) |meta_start| {
            const meta_json_start = meta_start + 11; // len of "\"metadata\":"
            if (meta_json_start < trimmed.len) {
                // Find the end of metadata
                var depth: usize = 0;
                var end_pos = meta_json_start;
                for (trimmed[meta_json_start..], meta_json_start..) |c, i| {
                    if (c == '{') depth += 1;
                    if (c == '}') {
                        if (depth == 1) {
                            end_pos = i + 1;
                            break;
                        }
                        depth -= 1;
                    }
                }
                if (end_pos > meta_json_start) {
                    metadata_str = try allocator.dupe(u8, trimmed[meta_json_start..end_pos]);
                }
            }
        }

        try list.append(allocator, .{
            .id = try allocator.dupe(u8, id),
            .timestamp = try allocator.dupe(u8, timestamp),
            .category = try allocator.dupe(u8, category),
            .message = try allocator.dupe(u8, message),
            .source = if (source_val) |s| try allocator.dupe(u8, s.string) else null,
            .metadata = metadata_str,
        });
    }
}
