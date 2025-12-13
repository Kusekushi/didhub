const std = @import("std");
const types = @import("types.zig");
const cli = @import("cli.zig");
const storage = @import("storage.zig");
const handlers = @import("handlers.zig");

test "cli.parse_command parses append with category and message" {
    const allocator = std.testing.allocator;
    var args_arr: [6][]const u8 = .{ "prog", "append", "--category", "audit", "--message", "test message" };
    const args: []const []const u8 = args_arr[0..];
    const cmd = try cli.parse_command(args, allocator);
    switch (cmd) {
        .append => |opts| {
            var myopts = opts;
            try std.testing.expectEqual(opts.category, .Audit);
            try std.testing.expectEqualStrings(myopts.message, "test message");
            try std.testing.expect(myopts.source == null);
            myopts.metadata.deinit();
        },
        else => try std.testing.expect(false),
    }
}

test "cli.parse_command parses append with job category" {
    const allocator = std.testing.allocator;
    var args_arr: [6][]const u8 = .{ "prog", "append", "--category", "job", "--message", "job message" };
    const args: []const []const u8 = args_arr[0..];
    const cmd = try cli.parse_command(args, allocator);
    switch (cmd) {
        .append => |opts| {
            var myopts = opts;
            try std.testing.expectEqual(opts.category, .Job);
            try std.testing.expectEqualStrings(myopts.message, "job message");
            myopts.metadata.deinit();
        },
        else => try std.testing.expect(false),
    }
}

test "cli.parse_command parses append with source" {
    const allocator = std.testing.allocator;
    var args_arr: [8][]const u8 = .{ "prog", "append", "--category", "audit", "--message", "msg", "--source", "test_source" };
    const args: []const []const u8 = args_arr[0..];
    const cmd = try cli.parse_command(args, allocator);
    switch (cmd) {
        .append => |opts| {
            var myopts = opts;
            try std.testing.expectEqual(opts.category, .Audit);
            try std.testing.expectEqualStrings(myopts.message, "msg");
            try std.testing.expectEqualStrings(myopts.source.?, "test_source");
            myopts.metadata.deinit();
        },
        else => try std.testing.expect(false),
    }
}

test "cli.parse_command parses export with category" {
    const allocator = std.testing.allocator;
    var args_arr: [4][]const u8 = .{ "prog", "export", "--category", "job" };
    const args: []const []const u8 = args_arr[0..];
    const cmd = try cli.parse_command(args, allocator);
    switch (cmd) {
        .export_cmd => |opts| {
            try std.testing.expectEqual(opts.category, .Job);
            try std.testing.expectEqual(opts.format, .Json);
        },
        else => try std.testing.expect(false),
    }
}

test "cli.parse_command parses delete with category" {
    const allocator = std.testing.allocator;
    var args_arr: [4][]const u8 = .{ "prog", "delete", "--category", "audit" };
    const args: []const []const u8 = args_arr[0..];
    const cmd = try cli.parse_command(args, allocator);
    switch (cmd) {
        .delete => |opts| {
            try std.testing.expectEqual(opts.category, .Audit);
        },
        else => try std.testing.expect(false),
    }
}

test "storage.gen_uuid_v4 creates canonical uuid" {
    const allocator = std.testing.allocator;
    const uuid = try storage.gen_uuid_v4(allocator);
    defer allocator.free(uuid);
    try std.testing.expect(uuid.len == 36);
    try std.testing.expect(uuid[8] == '-' and uuid[13] == '-' and uuid[18] == '-' and uuid[23] == '-');
}

test "handlers.append writes entry and load_entries reads it" {
    const allocator = std.testing.allocator;
    // create a temp storage dir under ./var/logs/
    const base_dir = try std.fmt.allocPrint(allocator, ".\\var\\logs\\log_collector_test_{d}", .{std.time.milliTimestamp()});
    defer allocator.free(base_dir);
    try storage.ensure_storage_dir(base_dir);

    const cfg = types.Config{ .storage_path = try allocator.dupe(u8, base_dir) };
    defer allocator.free(cfg.storage_path);

    var opts = types.AppendOptions{ .category = .Audit, .message = "UnitTestMessage", .source = null, .metadata = std.StringHashMap([]const u8).init(allocator) };
    defer opts.metadata.deinit();
    try opts.metadata.put("k", "v");

    try handlers.handle_append(opts, cfg, allocator);

    const logfile_path = try std.fmt.allocPrint(allocator, "{s}/audit.log", .{cfg.storage_path});
    defer allocator.free(logfile_path);

    var entries = try std.ArrayList(types.LogEntry).initCapacity(allocator, 0);
    defer entries.deinit(allocator);
    try storage.load_entries(logfile_path, &entries, allocator);
    try std.testing.expect(entries.items.len == 1);
    const e = entries.items[0];
    try std.testing.expect(std.mem.eql(u8, e.message, "UnitTestMessage"));

    // free content inside entries (they were duplicated into allocator)
    for (entries.items) |entry| {
        allocator.free(entry.id);
        allocator.free(entry.timestamp);
        allocator.free(entry.category);
        allocator.free(entry.message);
        if (entry.source) |s| allocator.free(s);
        if (entry.metadata) |m| allocator.free(m);
    }

    // delete and confirm file is gone
    try handlers.handle_delete(types.DeleteOptions{}, cfg, allocator);
    // ensure open fails
    var fs = std.fs.cwd();
    if (fs.openFile(logfile_path, .{})) |f| {
        _ = f;
        try std.testing.expect(false);
    } else |err| {
        try std.testing.expect(err == error.FileNotFound);
    }
}
