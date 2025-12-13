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

test "parseLogLevel handles JSON logs correctly" {
    // Test JSON audit log
    try std.testing.expectEqual(log.LogLevel.Info, log.parseLogLevel("{\"category\":\"audit\",\"message\":\"test\"}") orelse unreachable);
    try std.testing.expectEqual(log.LogLevel.Error, log.parseLogLevel("{\"category\":\"error\",\"message\":\"test\"}") orelse unreachable);
    try std.testing.expectEqual(log.LogLevel.Warn, log.parseLogLevel("{\"category\":\"warn\",\"message\":\"test\"}") orelse unreachable);
    try std.testing.expectEqual(log.LogLevel.Info, log.parseLogLevel("{\"category\":\"info\",\"message\":\"test\"}") orelse unreachable);
    try std.testing.expectEqual(log.LogLevel.Debug, log.parseLogLevel("{\"category\":\"debug\",\"message\":\"test\"}") orelse unreachable);

    // Test unknown category returns null
    try std.testing.expectEqual(null, log.parseLogLevel("{\"category\":\"unknown\",\"message\":\"test\"}"));

    // Test malformed JSON still falls back to bracket parsing
    try std.testing.expectEqual(log.LogLevel.Info, log.parseLogLevel("timestamp [INFO] message") orelse unreachable);
}

test "parseLogLevelWithPos handles JSON logs correctly" {
    const json_line = "{\"id\":\"123\",\"timestamp\":\"1765608798794\",\"category\":\"audit\",\"message\":\"--category\"}";
    const result = log.parseLogLevelWithPos(json_line) orelse unreachable;

    try std.testing.expectEqual(log.LogLevel.Info, result.level);
    // For JSON, positions point to the category value in the JSON string
    try std.testing.expect(result.level_start < result.level_end);
    try std.testing.expect(result.level_end <= json_line.len);
}

test "parseLogLineView handles JSON logs correctly" {
    const json_line = "{\"id\":\"123\",\"timestamp\":\"1765608798794\",\"category\":\"audit\",\"message\":\"--category\"}";
    const view = log.parseLogLineView(json_line) orelse unreachable;

    try std.testing.expectEqual(log.LogLevel.Info, view.level);
    try std.testing.expectEqualStrings("1765608798794", view.timestamp);
    try std.testing.expectEqualStrings("--category", view.message);

    // View should point into original line
    const line_start = @intFromPtr(json_line.ptr);
    const line_end = @intFromPtr(json_line.ptr) + json_line.len;
    const timestamp_start = @intFromPtr(view.timestamp.ptr);
    const message_start = @intFromPtr(view.message.ptr);
    try std.testing.expect(timestamp_start >= line_start);
    try std.testing.expect(timestamp_start < line_end);
    try std.testing.expect(message_start >= line_start);
    try std.testing.expect(message_start < line_end);
}

test "parse_log_line handles JSON logs correctly" {
    const allocator = std.testing.allocator;
    const json_line = "{\"id\":\"123\",\"timestamp\":\"1765608798794\",\"category\":\"error\",\"message\":\"Something failed\"}";

    const entry = try log.parse_log_line(json_line, allocator) orelse unreachable;
    defer entry.deinit(allocator);

    try std.testing.expectEqualStrings("1765608798794", entry.timestamp);
    try std.testing.expectEqual(log.LogLevel.Error, entry.level);
    try std.testing.expectEqualStrings("Something failed", entry.message);
    try std.testing.expectEqual(null, entry.source);
}

test "JSON log parsing handles missing fields gracefully" {
    // Missing message field
    const json_no_message = "{\"category\":\"info\",\"timestamp\":\"123\"}";
    const view = log.parseLogLineView(json_no_message) orelse unreachable;
    try std.testing.expectEqual(log.LogLevel.Info, view.level);
    try std.testing.expectEqualStrings("123", view.timestamp);
    try std.testing.expectEqualStrings("", view.message);

    // Missing timestamp field
    const json_no_timestamp = "{\"category\":\"warn\",\"message\":\"test\"}";
    const view2 = log.parseLogLineView(json_no_timestamp) orelse unreachable;
    try std.testing.expectEqual(log.LogLevel.Warn, view2.level);
    try std.testing.expectEqualStrings("", view2.timestamp);
    try std.testing.expectEqualStrings("test", view2.message);
}

test "JSON log parsing with StreamingLogReader" {
    const allocator = std.testing.allocator;

    // Create a test file with JSON logs
    const cwd = std.fs.cwd();
    const file_path = "test_json.log";
    const file = try cwd.createFile(file_path, .{ .truncate = true });
    defer {
        std.fs.cwd().deleteFile(file_path) catch {};
    }

    try file.writeAll("{\"timestamp\":\"1765608798794\",\"category\":\"audit\",\"message\":\"--category\"}\n");
    try file.writeAll("{\"timestamp\":\"1765608798795\",\"category\":\"error\",\"message\":\"Something failed\"}\n");
    file.close();

    var rdr = try reader.StreamingLogReader.init(allocator, file_path);
    defer rdr.deinit();

    try std.testing.expectEqual(2, rdr.count());
    try std.testing.expectEqual(log.LogLevel.Info, rdr.getLevelAt(0) orelse unreachable);
    try std.testing.expectEqual(log.LogLevel.Error, rdr.getLevelAt(1) orelse unreachable);

    const counts = rdr.getLevelCounts();
    try std.testing.expectEqual(@as(usize, 0), counts.debug);
    try std.testing.expectEqual(@as(usize, 1), counts.info);
    try std.testing.expectEqual(@as(usize, 0), counts.warn);
    try std.testing.expectEqual(@as(usize, 1), counts.err);

    const view = try rdr.readEntryView(0) orelse unreachable;
    try std.testing.expectEqual(log.LogLevel.Info, view.level);
    try std.testing.expectEqualStrings("--category", view.message);
}
