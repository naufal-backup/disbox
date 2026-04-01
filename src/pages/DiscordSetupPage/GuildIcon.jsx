export default function GuildIcon({ guild, size = 44 }) {
  if (guild.icon) {
    return (
      <img
        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  const initials = guild.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const colors   = ['#5865f2','#3ba55d','#faa61a','#ed4245','#eb459e','#00d4aa'];
  const bg       = colors[parseInt(guild.id.slice(-2), 16) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: '#fff', fontFamily: 'Syne, sans-serif',
    }}>
      {initials}
    </div>
  );
}
