const std = @import("std");
const types = @import("types.zig");
const cli = @import("cli.zig");
const handlers = @import("handlers.zig");
const storage = @import("storage.zig");
const errors = @import("errors.zig");

pub fn main() anyerror!void {
    // Use GPA in debug for leak detection, page_allocator in release for speed
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const args = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, args);

    const config = try cli.parse_config(args, allocator);
    defer allocator.free(config.storage_path);

    const command = try cli.parse_command(args, allocator);

    try storage.ensure_storage_dir(config.storage_path);

    switch (command) {
        .append => |opts| {
            defer {
                var m = opts.metadata;
                m.deinit();
            }
            try handlers.handle_append(opts, config, allocator);
        },
        .export_cmd => |opts| try handlers.handle_export(opts, config, allocator),
        .delete => |opts| try handlers.handle_delete(opts, config, allocator),
        .status => try handlers.handle_status(config, allocator),
        .help => try cli.print_help(),
    }
}
