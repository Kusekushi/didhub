const std = @import("std");
const config = @import("config.zig");
const interactive = @import("interactive.zig");
const tui_mod = @import("tui.zig");
const writers = @import("writers.zig");
// const validation = @import("schema/validation.zig");

fn printHelp() void {
    const help_text =
        \\Usage: config-generator [OPTIONS]
        \\
        \\Generate configuration files for DIDAlterHub in various formats.
        \\
        \\OPTIONS:
        \\  --format <fmt>     Output format: json, toml, yaml (default: toml)
        \\  --output <file>    Output file path (default: example/config.generated.<fmt>)
        \\  --defaults         Generate with default values only (no interactive mode)
        \\  --tui              Use Terminal User Interface for configuration
        \\  --cli              Use Command Line Interface for configuration (default)
        \\  --help             Show this help message
        \\
        \\EXAMPLES:
        \\  config-generator --format json --output myconfig.json
        \\  config-generator --defaults --format yaml
        \\  config-generator --tui
        \\
    ;
    std.debug.print("{s}", .{help_text});
}

pub fn main() anyerror!void {
    const stdout = std.fs.File.stdout().deprecatedWriter();
    const allocator = std.heap.page_allocator;

    const args = std.process.argsAlloc(allocator) catch |err| {
        std.debug.print("failed to read args: {}\n", .{err});
        return err;
    };
    defer _ = std.process.argsFree(allocator, args);

    var fmt: []const u8 = "toml";
    var out_path: []const u8 = "";
    var defaults_only = false;
    var use_tui = false;
    var show_help = false;

    // Parse command line arguments
    var i: usize = 1;
    while (i < args.len) : (i += 1) {
        const a = args[i];
        if (std.mem.eql(u8, a, "--help") or std.mem.eql(u8, a, "-h")) {
            show_help = true;
        } else if (std.mem.eql(u8, a, "--format") and i + 1 < args.len) {
            fmt = args[i + 1];
            i += 1;
        } else if (std.mem.eql(u8, a, "--output") and i + 1 < args.len) {
            out_path = args[i + 1];
            i += 1;
        } else if (std.mem.eql(u8, a, "--defaults")) {
            defaults_only = true;
        } else if (std.mem.eql(u8, a, "--tui")) {
            use_tui = true;
        } else if (std.mem.eql(u8, a, "--cli")) {
            use_tui = false;
        } else {
            std.debug.print("Unknown option: {s}\nUse --help for usage information.\n", .{a});
            return error.InvalidArgument;
        }
    }

    if (show_help) {
        printHelp();
        return;
    }

    if (out_path.len == 0) {
        const base = "example/config.generated.";
        out_path = try std.fmt.allocPrint(allocator, "{s}{s}", .{ base, fmt });
    }

    // Ensure the output directory exists
    if (std.fs.path.dirname(out_path)) |dir| {
        try std.fs.cwd().makePath(dir);
    }

    // Default config values
    var cfg = config.Config.init(allocator) catch |err| {
        std.debug.print("failed to init config: {}\n", .{err});
        return err;
    };
    defer cfg.deinit();

    if (!defaults_only) {
        if (use_tui) {
            try tui_mod.gather_interactive_tui(allocator, &cfg);
        } else {
            try interactive.gather_interactive(allocator, &cfg);
        }
    }

    // TODO: Add validation here
    // const validation_result = try validation.validateConfig(allocator, &cfg);
    // switch (validation_result) {
    //     .valid => {},
    //     .invalid => |errors| {
    //         const stderr = std.fs.File.stderr().deprecatedWriter();
    //         try stderr.print("Configuration validation failed:\n", .{});
    //         for (errors) |err| {
    //             try stderr.print("  {s}: {s}\n", .{ err.field_path, err.message });
    //         }
    //         return error.ValidationFailed;
    //     },
    // }

    // Prune None/Nulls and write
    try writers.write_config(&cfg, fmt, out_path);
    try stdout.print("Wrote {s}\n", .{out_path});
}
