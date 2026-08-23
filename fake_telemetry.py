import socket, struct, time, math

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
packet = bytearray(331)

# IsRaceOn at offset 0
struct.pack_into('<i', packet, 0, 1)

# Speed (vx,vy,vz) at 32 (let's set vz = 30 m/s ~ 108 kmh)
struct.pack_into('<fff', packet, 32, 0.0, 0.0, 30.0)

# Gear at 319 (1st byte)
struct.pack_into('<B', packet, 319, 3)

# Drivetrain at 224 (0=FWD, 1=RWD, 2=AWD)
struct.pack_into('<i', packet, 224, 2)

while True:
    sock.sendto(packet, ("127.0.0.1", 5300))
    time.sleep(0.033)
