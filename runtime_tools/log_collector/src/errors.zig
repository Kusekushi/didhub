pub const Err = error{ InvalidUsage, LockUnavailable, InvalidFormat, LockTimeout };

pub fn errorUsage() anyerror!void {
    return Err.InvalidUsage;
}
