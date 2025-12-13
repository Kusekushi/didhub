const std = @import("std");
const types = @import("types.zig");
const storage = @import("storage.zig");
const errors = @import("errors.zig");

const json_entry_start = "{\"id\":\"";
const json_ts_field = "\",\"timestamp\":\"";
const json_cat_start = "\",\"category\":\"";
const json_cat_end = "\",\"message\":\"";
const json_source_field = "\",\"source\":\"";
const json_metadata_field = ",\"metadata\":";
const json_entry_end = "}\n";

const stack_buf_size = 512;

pub fn handle_append(opts: types.AppendOptions, config: types.Config, allocator: types.Allocator) anyerror!void {
    if (opts.message.len == 0) {
        return errors.errorUsage();
    }

    const has_metadata = opts.metadata.count() > 0;
    const has_source = opts.source != null;

    const category_str = switch (opts.category) {
        .Audit => "audit",
        .Job => "job",
    };

    const ts = storage.timestamp_ms(allocator);
    defer allocator.free(ts);
    const uuid = try storage.gen_uuid_v4(allocator);
    defer allocator.free(uuid);

    const entry_size = json_entry_start.len + uuid.len + json_ts_field.len + ts.len +
        json_cat_start.len + category_str.len + json_cat_end.len + opts.message.len + 1 + // +1 for closing quote
        (if (has_source) json_source_field.len + opts.source.?.len + 1 else 0) + // +1 for quote
        (if (has_metadata) json_metadata_field.len + 2 else 0) +
        json_entry_end.len;

    var stack_buf: [stack_buf_size]u8 = undefined;
    var heap_buf: ?[]u8 = null;
    defer if (heap_buf) |b| allocator.free(b);

    const buf: []u8 = if (entry_size <= stack_buf_size)
        &stack_buf
    else blk: {
        heap_buf = try allocator.alloc(u8, entry_size);
        break :blk heap_buf.?;
    };

    var pos: usize = 0;
    @memcpy(buf[pos..][0..json_entry_start.len], json_entry_start);
    pos += json_entry_start.len;
    @memcpy(buf[pos..][0..uuid.len], uuid);
    pos += uuid.len;
    @memcpy(buf[pos..][0..json_ts_field.len], json_ts_field);
    pos += json_ts_field.len;
    @memcpy(buf[pos..][0..ts.len], ts);
    pos += ts.len;
    @memcpy(buf[pos..][0..json_cat_start.len], json_cat_start);
    pos += json_cat_start.len;
    @memcpy(buf[pos..][0..category_str.len], category_str);
    pos += category_str.len;
    @memcpy(buf[pos..][0..json_cat_end.len], json_cat_end);
    pos += json_cat_end.len;
    @memcpy(buf[pos..][0..opts.message.len], opts.message);
    pos += opts.message.len;
    buf[pos] = '"';
    pos += 1;
    if (has_source) {
        @memcpy(buf[pos..][0..json_source_field.len], json_source_field);
        pos += json_source_field.len;
        @memcpy(buf[pos..][0..opts.source.?.len], opts.source.?);
        pos += opts.source.?.len;
        buf[pos] = '"';
        pos += 1;
    }
    if (has_metadata) {
        @memcpy(buf[pos..][0..json_metadata_field.len], json_metadata_field);
        pos += json_metadata_field.len;
        @memcpy(buf[pos..][0..2], "{}");
        pos += 2;
    }
    @memcpy(buf[pos..][0..json_entry_end.len], json_entry_end);
    pos += json_entry_end.len;

    const path = try std.fmt.allocPrint(allocator, "{s}/{s}.log", .{ config.storage_path, category_str });
    defer allocator.free(path);

    const lock_path = try std.fmt.allocPrint(allocator, "{s}/{s}.log.lock", .{ config.storage_path, category_str });
    defer allocator.free(lock_path);

    try storage.acquire_lock(lock_path);
    defer storage.release_lock(lock_path);

    const file = std.fs.cwd().openFile(path, .{ .mode = .read_write }) catch |err| switch (err) {
        error.FileNotFound => try std.fs.cwd().createFile(path, .{}),
        else => return err,
    };
    defer file.close();

    try file.seekFromEnd(0);
    try file.writeAll(buf[0..pos]);
    std.debug.print("stored\t{s}\n", .{uuid});
}

fn comparatorTimestamp(_: void, a: types.LogEntry, b: types.LogEntry) bool {
    return std.mem.order(u8, a.timestamp, b.timestamp) == .lt;
}

fn freeEntry(entry: types.LogEntry, allocator: types.Allocator) void {
    allocator.free(entry.id);
    allocator.free(entry.timestamp);
    allocator.free(entry.category);
    allocator.free(entry.message);
    if (entry.source) |s| allocator.free(s);
    if (entry.metadata) |m| allocator.free(m);
}

pub fn handle_export(opts: types.ExportOptions, config: types.Config, allocator: types.Allocator) anyerror!void {
    var entries = try std.ArrayList(types.LogEntry).initCapacity(allocator, 64);
    defer {
        for (entries.items) |entry| freeEntry(entry, allocator);
        entries.deinit(allocator);
    }

    const category = opts.category orelse .Audit;
    const category_str = switch (category) {
        .Audit => "audit",
        .Job => "job",
    };

    const path = try std.fmt.allocPrint(allocator, "{s}/{s}.log", .{ config.storage_path, category_str });
    defer allocator.free(path);
    try storage.load_entries(path, &entries, allocator);

    std.mem.sort(types.LogEntry, entries.items, {}, comparatorTimestamp);

    if (opts.format == .Json) {
        std.debug.print("[", .{});
        for (entries.items, 0..) |e, i| {
            if (i > 0) std.debug.print(",\n", .{});
            std.debug.print("  {{\"id\":\"{s}\",\"timestamp\":\"{s}\",\"category\":\"{s}\",\"message\":\"{s}\"", .{ e.id, e.timestamp, e.category, e.message });
            if (e.metadata) |m| std.debug.print(",\"metadata\":{s}", .{m});
            std.debug.print("}}", .{});
        }
        std.debug.print("\n]\n", .{});
    } else {
        // Plain text format
        for (entries.items) |e| {
            if (e.metadata) |m| {
                std.debug.print("{s}\t{s}\t{s}\tmetadata={s}\n", .{ e.timestamp, e.category, e.message, m });
            } else {
                std.debug.print("{s}\t{s}\t{s}\n", .{ e.timestamp, e.category, e.message });
            }
        }
    }
}

pub fn handle_delete(opts: types.DeleteOptions, config: types.Config, allocator: types.Allocator) anyerror!void {
    const category = opts.category orelse .Audit;
    const category_str = switch (category) {
        .Audit => "audit",
        .Job => "job",
    };
    const path = try std.fmt.allocPrint(allocator, "{s}/{s}.log", .{ config.storage_path, category_str });
    defer allocator.free(path);
    try storage.clear_log(path);
}

pub fn handle_status(config: types.Config, allocator: types.Allocator) anyerror!void {
    const path = try std.fmt.allocPrint(allocator, "{s}/audit.log", .{config.storage_path});
    defer allocator.free(path);

    var entries: usize = 0;
    var size: u64 = 0;

    if (std.fs.cwd().openFile(path, .{})) |file| {
        defer file.close();

        const stat = try file.stat();
        size = stat.size;

        const content = try file.readToEndAlloc(allocator, std.math.maxInt(usize));
        defer allocator.free(content);

        var pos: usize = 0;
        while (std.mem.indexOfPos(u8, content, pos, "\"id\":")) |idx| {
            entries += 1;
            pos = idx + 5;
        }
    } else |err| switch (err) {
        error.FileNotFound => {},
        else => return err,
    }

    std.debug.print("audit\tpath={s}\tentries={d}\tsize_bytes={d}\n", .{ path, entries, size });
}
