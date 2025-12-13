pub const Err = error{ InvalidUsage, LockUnavailable, InvalidFormat, LockTimeout, InvalidArgs };

pub fn errorUsage() anyerror!void {
    return Err.InvalidUsage;
}
