const std = @import("std");
const types = @import("types.zig");
const storage = @import("storage.zig");
const errors = @import("errors.zig");

pub fn parse_config(args: []const []const u8, allocator: types.Allocator) anyerror!types.Config {
    var storage_path: []const u8 = "";

    // Skip program name, look for --storage flag
    var i: usize = 1;
    while (i < args.len) : (i += 1) {
        if (args[i].len >= 9 and std.mem.eql(u8, args[i], "--storage")) {
            if (i + 1 < args.len) {
                storage_path = args[i + 1];
                break; // Found it, no need to continue
            }
        }
    }

    return .{ .storage_path = try storage.resolve_storage(storage_path, allocator) };
}

const cmd_append = "append";
const cmd_export = "export";
const cmd_delete = "delete";
const cmd_status = "status";

pub fn parse_command(args: []const []const u8, allocator: types.Allocator) anyerror!types.Command {
    if (args.len <= 1) return .{ .help = {} };

    const command = args[1];
    const cmd_len = command.len;

    if (cmd_len == 6) {
        if (std.mem.eql(u8, command, cmd_append)) {
            return parseAppendCommand(args, allocator);
        } else if (std.mem.eql(u8, command, cmd_export)) {
            return parseExportCommand(args);
        } else if (std.mem.eql(u8, command, cmd_delete)) {
            return .{ .delete = .{} };
        } else if (std.mem.eql(u8, command, cmd_status)) {
            return .{ .status = {} };
        }
    }

    return .{ .help = {} };
}

fn parseAppendCommand(args: []const []const u8, allocator: types.Allocator) anyerror!types.Command {
    var opts = types.AppendOptions{
        .message = "",
        .metadata = std.StringHashMap([]const u8).init(allocator),
    };

    var i: usize = 2;
    while (i < args.len) : (i += 1) {
        const a = args[i];
        if (a.len == 6 and std.mem.eql(u8, a, "--meta") and i + 2 < args.len) {
            try opts.metadata.put(args[i + 1], args[i + 2]);
            i += 2;
        } else if (opts.message.len == 0) {
            opts.message = a;
        }
    }

    return .{ .append = opts };
}

fn parseExportCommand(args: []const []const u8) anyerror!types.Command {
    var opts = types.ExportOptions{ .format = .Json };

    var i: usize = 2;
    while (i < args.len) : (i += 1) {
        const a = args[i];
        if (a.len == 8 and std.mem.eql(u8, a, "--format") and i + 1 < args.len) {
            const fmt = args[i + 1];
            if (fmt.len == 4 and std.mem.eql(u8, fmt, "json")) {
                opts.format = .Json;
            } else if (fmt.len == 4 and std.mem.eql(u8, fmt, "text")) {
                opts.format = .Plain;
            } else {
                return errors.Err.InvalidFormat;
            }
            i += 1;
        }
    }

    return .{ .export_cmd = opts };
}

pub fn print_help() anyerror!void {
    std.debug.print("DIDHub log collector\n", .{});
    std.debug.print("Usage:\n", .{});
    std.debug.print("  append --category <audit|job> --message <text> [--source <name>] [--metadata <json>]\n", .{});
    std.debug.print("  export [--category <audit|job>] [--limit N] [--format json|plain] [--drain]\n", .{});
    std.debug.print("  delete [--category <audit|job>]\n", .{});
    std.debug.print("  status\n", .{});
}
