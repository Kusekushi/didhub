const std = @import("std");

pub const Allocator = std.mem.Allocator;

pub const Category = enum { Audit, Job };
pub const OutputFormat = enum { Json, Plain };

pub const LogEntry = struct {
    id: []const u8,
    timestamp: []const u8,
    category: []const u8,
    message: []const u8,
    source: ?[]const u8,
    metadata: ?[]const u8,
};

pub const Config = struct {
    storage_path: []const u8,
};

pub const AppendOptions = struct {
    message: []const u8,
    metadata: std.StringHashMap([]const u8),
};

pub const ExportOptions = struct {
    category: ?Category = null,
    limit: ?usize = null,
    format: OutputFormat = .Json,
    drain: bool = false,
};

pub const DeleteOptions = struct {
    category: ?Category = null,
};

pub const Command = union(enum) {
    append: AppendOptions,
    export_cmd: ExportOptions,
    delete: DeleteOptions,
    status: void,
    help: void,
};
