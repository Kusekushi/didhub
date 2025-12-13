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
            return parseDeleteCommand(args);
        } else if (std.mem.eql(u8, command, cmd_status)) {
            return .{ .status = {} };
        }
    }

    return .{ .help = {} };
}

fn parseAppendCommand(args: []const []const u8, allocator: types.Allocator) anyerror!types.Command {
    var opts = types.AppendOptions{
        .category = .Audit, // default
        .message = "",
        .source = null,
        .metadata = std.StringHashMap([]const u8).init(allocator),
    };

    var i: usize = 2;
    while (i < args.len) : (i += 1) {
        const a = args[i];
        if (std.mem.eql(u8, a, "--category")) {
            if (i + 1 >= args.len) return errors.Err.InvalidArgs;
            const cat = args[i + 1];
            if (std.mem.eql(u8, cat, "audit")) {
                opts.category = .Audit;
            } else if (std.mem.eql(u8, cat, "job")) {
                opts.category = .Job;
            } else {
                return errors.Err.InvalidArgs;
            }
            i += 1;
        } else if (std.mem.eql(u8, a, "--message")) {
            if (i + 1 >= args.len) return errors.Err.InvalidArgs;
            opts.message = args[i + 1];
            i += 1;
        } else if (std.mem.eql(u8, a, "--source")) {
            if (i + 1 >= args.len) return errors.Err.InvalidArgs;
            opts.source = args[i + 1];
            i += 1;
        } else if (std.mem.eql(u8, a, "--meta")) {
            if (i + 2 >= args.len) return errors.Err.InvalidArgs;
            try opts.metadata.put(args[i + 1], args[i + 2]);
            i += 2;
        } else {
            return errors.Err.InvalidArgs; // unknown flag
        }
    }

    if (opts.message.len == 0) return errors.Err.InvalidArgs;

    return .{ .append = opts };
}

fn parseExportCommand(args: []const []const u8) anyerror!types.Command {
    var opts = types.ExportOptions{ .format = .Json };

    var i: usize = 2;
    while (i < args.len) : (i += 1) {
        const a = args[i];
        if (std.mem.eql(u8, a, "--category")) {
            if (i + 1 >= args.len) return errors.Err.InvalidArgs;
            const cat = args[i + 1];
            if (std.mem.eql(u8, cat, "audit")) {
                opts.category = .Audit;
            } else if (std.mem.eql(u8, cat, "job")) {
                opts.category = .Job;
            } else {
                return errors.Err.InvalidArgs;
            }
            i += 1;
        } else if (std.mem.eql(u8, a, "--format")) {
            if (i + 1 >= args.len) return errors.Err.InvalidArgs;
            const fmt = args[i + 1];
            if (std.mem.eql(u8, fmt, "json")) {
                opts.format = .Json;
            } else if (std.mem.eql(u8, fmt, "text")) {
                opts.format = .Plain;
            } else {
                return errors.Err.InvalidFormat;
            }
            i += 1;
        } else if (std.mem.eql(u8, a, "--limit")) {
            if (i + 1 >= args.len) return errors.Err.InvalidArgs;
            opts.limit = std.fmt.parseInt(usize, args[i + 1], 10) catch return errors.Err.InvalidArgs;
            i += 1;
        } else if (std.mem.eql(u8, a, "--drain")) {
            opts.drain = true;
        } else {
            return errors.Err.InvalidArgs;
        }
    }

    return .{ .export_cmd = opts };
}

fn parseDeleteCommand(args: []const []const u8) anyerror!types.Command {
    var opts = types.DeleteOptions{};

    var i: usize = 2;
    while (i < args.len) : (i += 1) {
        const a = args[i];
        if (std.mem.eql(u8, a, "--category")) {
            if (i + 1 >= args.len) return errors.Err.InvalidArgs;
            const cat = args[i + 1];
            if (std.mem.eql(u8, cat, "audit")) {
                opts.category = .Audit;
            } else if (std.mem.eql(u8, cat, "job")) {
                opts.category = .Job;
            } else {
                return errors.Err.InvalidArgs;
            }
            i += 1;
        } else {
            return errors.Err.InvalidArgs;
        }
    }

    return .{ .delete = opts };
}

pub fn print_help() anyerror!void {
    std.debug.print("DIDHub log collector\n", .{});
    std.debug.print("Usage:\n", .{});
    std.debug.print("  append --category <audit|job> --message <text> [--source <name>] [--metadata <json>]\n", .{});
    std.debug.print("  export [--category <audit|job>] [--limit N] [--format json|plain] [--drain]\n", .{});
    std.debug.print("  delete [--category <audit|job>]\n", .{});
    std.debug.print("  status\n", .{});
}
