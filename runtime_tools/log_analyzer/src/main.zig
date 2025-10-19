const std = @import("std");
const log = @import("log.zig");
const rdr = @import("reader.zig");
const analyzer = @import("analyzer.zig");
const tui = @import("tui.zig");

const Command = enum {
    analyze,
    tui,
    help,
    version,
};

const Args = struct {
    command: Command,
    input_file: ?[]const u8,
    output_file: ?[]const u8,
    json_output: bool,
    quick_mode: bool, // Skip error message analysis for faster results

    fn parse(args: []const []const u8) Args {
        var result = Args{
            .command = .help,
            .input_file = null,
            .output_file = null,
            .json_output = false,
            .quick_mode = false,
        };

        if (args.len < 2) return result;

        const cmd = args[1];
        if (std.mem.eql(u8, cmd, "analyze")) {
            result.command = .analyze;
        } else if (std.mem.eql(u8, cmd, "tui")) {
            result.command = .tui;
        } else if (std.mem.eql(u8, cmd, "help") or std.mem.eql(u8, cmd, "-h") or std.mem.eql(u8, cmd, "--help")) {
            result.command = .help;
            return result;
        } else if (std.mem.eql(u8, cmd, "version") or std.mem.eql(u8, cmd, "-v") or std.mem.eql(u8, cmd, "--version")) {
            result.command = .version;
            return result;
        } else {
            return result;
        }

        var i: usize = 2;
        while (i < args.len) : (i += 1) {
            const arg = args[i];

            if ((std.mem.eql(u8, arg, "--input") or std.mem.eql(u8, arg, "-i")) and i + 1 < args.len) {
                result.input_file = args[i + 1];
                i += 1;
            } else if ((std.mem.eql(u8, arg, "--output") or std.mem.eql(u8, arg, "-o")) and i + 1 < args.len) {
                result.output_file = args[i + 1];
                i += 1;
            } else if (std.mem.eql(u8, arg, "--json") or std.mem.eql(u8, arg, "-j")) {
                result.json_output = true;
            } else if (std.mem.eql(u8, arg, "--quick") or std.mem.eql(u8, arg, "-q")) {
                result.quick_mode = true;
            } else if (!std.mem.startsWith(u8, arg, "-") and result.input_file == null) {
                // Positional argument as input file
                result.input_file = arg;
            }
        }

        return result;
    }
};

fn printUsage() void {
    const usage =
        \\Usage: log-analyzer <command> [options]
        \\
        \\Commands:
        \\  analyze    Analyze log file and print statistics
        \\  tui        Interactive terminal UI for browsing logs
        \\  help       Show this help message
        \\  version    Show version information
        \\
        \\Options:
        \\  -i, --input <file>   Input log file path
        \\  -o, --output <file>  Output file path (for analyze command)
        \\  -j, --json           Output in JSON format (for analyze command)
        \\  -q, --quick          Quick mode - skip error message analysis
        \\
        \\Examples:
        \\  log-analyzer analyze -i app.log
        \\  log-analyzer analyze app.log --json -o report.json
        \\  log-analyzer tui -i app.log
        \\
    ;
    std.debug.print("{s}", .{usage});
}

fn printVersion() void {
    std.debug.print("DIDHub Log Analyzer v1.0.0\n", .{});
}

pub fn main() !void {
    // Use GeneralPurposeAllocator in debug, page_allocator in release
    var gpa: std.heap.GeneralPurposeAllocator(.{}) = .init;
    defer _ = gpa.deinit();

    const allocator = if (@import("builtin").mode == .Debug)
        gpa.allocator()
    else blk: {
        var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
        break :blk arena.allocator();
    };

    const args = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, args);

    const parsed = Args.parse(args);

    switch (parsed.command) {
        .help => printUsage(),
        .version => printVersion(),
        .analyze => try runAnalyze(allocator, parsed),
        .tui => try tui.run_tui(allocator, parsed.input_file),
    }
}

fn runAnalyze(allocator: std.mem.Allocator, args: Args) !void {
    const input_file = args.input_file orelse {
        std.debug.print("Error: No input file specified. Use -i <file>\n", .{});
        return;
    };

    var reader_obj = try rdr.StreamingLogReader.init(allocator, input_file);
    defer reader_obj.deinit();

    if (args.quick_mode) {
        // Quick mode - just level counts
        const result = analyzer.analyze_logs_quick(&reader_obj);
        if (args.json_output) {
            const json = try analyzer.to_json(result, allocator);
            defer allocator.free(json);

            if (args.output_file) |output_path| {
                const file = try std.fs.cwd().createFile(output_path, .{});
                defer file.close();
                try file.writeAll(json);
            } else {
                try std.fs.File.stdout().writeAll(json);
                try std.fs.File.stdout().writeAll("\n");
            }
        } else {
            analyzer.print_analysis(result);
        }
    } else {
        var result = try analyzer.analyze_logs_streaming(&reader_obj, allocator);
        defer result.deinit(allocator);

        if (args.json_output) {
            const json = try analyzer.to_json(result, allocator);
            defer allocator.free(json);

            if (args.output_file) |output_path| {
                const file = try std.fs.cwd().createFile(output_path, .{});
                defer file.close();
                try file.writeAll(json);
            } else {
                try std.fs.File.stdout().writeAll(json);
                try std.fs.File.stdout().writeAll("\n");
            }
        } else {
            analyzer.print_analysis(result);
        }
    }
}
