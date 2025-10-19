const std = @import("std");
const log = @import("log.zig");
const reader = @import("reader.zig");
const analyzer = @import("analyzer.zig");

pub fn create_sample_file() ![]const u8 {
    const cwd = std.fs.cwd();
    const file_path = "test_example.log";
    const file = try cwd.createFile(file_path, .{ .truncate = true });
    defer file.close();

    try file.writeAll("2025-12-05 10:00:00 [INFO] Starting;\n");
    try file.writeAll("2025-12-05 10:00:01 [ERROR] Something bad happened:\n");
    try file.writeAll("2025-12-05 10:00:02 [WARN] Be careful\n");

    return file_path;
}

test "parseLogLevel returns correct enum and null for malformed" {
    try std.testing.expectEqual(log.LogLevel.Info, log.parseLogLevel("2025 [INFO]") orelse unreachable);
    try std.testing.expectEqual(log.LogLevel.Error, log.parseLogLevel("2025 [ERROR]") orelse unreachable);
    try std.testing.expectEqual(null, log.parseLogLevel("no level here"));
}

test "parseLogLevelWithPos returns position info" {
    const result = log.parseLogLevelWithPos("2025-12-05 [INFO] message") orelse unreachable;
    try std.testing.expectEqual(log.LogLevel.Info, result.level);
    try std.testing.expectEqual(@as(usize, 11), result.level_start);
    try std.testing.expectEqual(@as(usize, 16), result.level_end);
}

test "parseLogLineView returns views without allocation" {
    const line = "2025-12-05 10:00:00 [INFO] Hello world";
    const view = log.parseLogLineView(line) orelse unreachable;

    try std.testing.expectEqual(log.LogLevel.Info, view.level);
    try std.testing.expectEqualStrings("Hello world", view.message);
    // View should point into original line (compare as usize)
    const line_start = @intFromPtr(line.ptr);
    const line_end = @intFromPtr(line.ptr) + line.len;
    const view_start = @intFromPtr(view.message.ptr);
    try std.testing.expect(view_start >= line_start);
    try std.testing.expect(view_start < line_end);
}

test "parse_log_line extracts timestamp, level, and message" {
    const timestamp_line = "2025-12-05 10:00:00 [INFO] Hello world";
    const allocator = std.testing.allocator;

    const entry = try log.parse_log_line(timestamp_line, allocator) orelse unreachable;
    defer entry.deinit(allocator);

    try std.testing.expect(std.mem.indexOf(u8, entry.timestamp, "2025-12-05 10:00:00") != null);
    try std.testing.expectEqual(log.LogLevel.Info, entry.level);
    try std.testing.expectEqualStrings(entry.message, "Hello world");
}

test "StreamingLogReader builds index and readEntry works" {
    const allocator = std.testing.allocator;
    const path = try create_sample_file();
    defer {
        std.fs.cwd().deleteFile(path) catch {};
    }

    var rdr = try reader.StreamingLogReader.init(allocator, path);
    defer rdr.deinit();

    try std.testing.expectEqual(3, rdr.count());
    try std.testing.expectEqual(log.LogLevel.Info, rdr.getLevelAt(0) orelse unreachable);
    try std.testing.expectEqual(log.LogLevel.Error, rdr.getLevelAt(1) orelse unreachable);
    try std.testing.expectEqual(log.LogLevel.Warn, rdr.getLevelAt(2) orelse unreachable);

    const entry1 = try rdr.readEntry(1) orelse unreachable;
    defer entry1.deinit(allocator);
    try std.testing.expectEqualStrings(entry1.message, "Something bad happened:");
}

test "StreamingLogReader getLevelCounts returns cached counts" {
    const allocator = std.testing.allocator;
    const path = try create_sample_file();
    defer {
        std.fs.cwd().deleteFile(path) catch {};
    }

    var rdr = try reader.StreamingLogReader.init(allocator, path);
    defer rdr.deinit();

    const counts = rdr.getLevelCounts();
    try std.testing.expectEqual(@as(usize, 0), counts.debug);
    try std.testing.expectEqual(@as(usize, 1), counts.info);
    try std.testing.expectEqual(@as(usize, 1), counts.warn);
    try std.testing.expectEqual(@as(usize, 1), counts.err);
}

test "StreamingLogReader readEntryView works without allocation" {
    const allocator = std.testing.allocator;
    const path = try create_sample_file();
    defer {
        std.fs.cwd().deleteFile(path) catch {};
    }

    var rdr = try reader.StreamingLogReader.init(allocator, path);
    defer rdr.deinit();

    const view = try rdr.readEntryView(0) orelse unreachable;
    try std.testing.expectEqual(log.LogLevel.Info, view.level);
    try std.testing.expectEqualStrings("Starting;", view.message);
}

test "analyze_logs_streaming calculates counts and top errors" {
    const allocator = std.testing.allocator;
    const path = try create_sample_file();
    defer {
        std.fs.cwd().deleteFile(path) catch {};
    }

    var rdr = try reader.StreamingLogReader.init(allocator, path);
    defer rdr.deinit();

    var result = try analyzer.analyze_logs_streaming(&rdr, allocator);
    defer result.deinit(allocator);

    try std.testing.expectEqual(3, result.total_logs);
    try std.testing.expectEqual(1, result.error_count);
    try std.testing.expectEqual(1, result.warn_count);
    try std.testing.expectEqual(1, result.info_count);

    try std.testing.expectEqual(1, result.top_errors.items.len);
    try std.testing.expectEqualStrings(result.top_errors.items[0].message, "Something bad happened:");
}

test "analyze_logs_quick skips error message analysis" {
    const allocator = std.testing.allocator;
    const path = try create_sample_file();
    defer {
        std.fs.cwd().deleteFile(path) catch {};
    }

    var rdr = try reader.StreamingLogReader.init(allocator, path);
    defer rdr.deinit();

    const result = analyzer.analyze_logs_quick(&rdr);

    try std.testing.expectEqual(3, result.total_logs);
    try std.testing.expectEqual(1, result.error_count);
    try std.testing.expectEqual(0, result.top_errors.items.len); // Quick mode doesn't analyze messages
}

test "LogLevel methods work correctly" {
    try std.testing.expectEqualStrings("\x1b[31m", log.LogLevel.Error.color());
    try std.testing.expectEqualStrings("\x1b[33m", log.LogLevel.Warn.color());
    try std.testing.expectEqualStrings("Error", log.LogLevel.Error.name());
    try std.testing.expectEqualStrings("Info", log.LogLevel.Info.name());
}

test "ErrorItem compareDesc sorts correctly" {
    var items = [_]log.ErrorItem{
        .{ .message = "a", .count = 5 },
        .{ .message = "b", .count = 10 },
        .{ .message = "c", .count = 3 },
    };

    std.mem.sort(log.ErrorItem, &items, {}, log.ErrorItem.compareDesc);

    try std.testing.expectEqual(@as(usize, 10), items[0].count);
    try std.testing.expectEqual(@as(usize, 5), items[1].count);
    try std.testing.expectEqual(@as(usize, 3), items[2].count);
}
