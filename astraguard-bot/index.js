import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials
} from 'discord.js';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// ENV VARS
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!DISCORD_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

// CONNECT SUPABASE
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// DISCORD CLIENT
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.GuildMember]
});

// LOG EVENT
async function logEvent({
  server_id,
  type,
  detail,
  metadata = {},
  user_id = null
}) {
  await supabase.from('events').insert([{
    server_id,
    type,
    detail,
    metadata,
    user_id,
    created_at: new Date().toISOString()
  }]);
}

// UPDATE SERVER
async function updateServer(guild) {
  await supabase.from('servers').upsert({
    id: guild.id,
    name: guild.name,
    owner_id: guild.ownerId,
    member_count: guild.memberCount,
    icon_url: guild.iconURL(),
    created_at: new Date().toISOString()
  }, { onConflict: 'id' });
}

// MEMBER COUNT
async function updateMembers(guild) {
  await supabase.from('servers').update({
    member_count: guild.memberCount
  }).eq('id', guild.id);
}

client.once("ready", () => {
  console.log(`AstraGuard Bot ONLINE como ${client.user.tag}`);
});

// BOT EM UM NOVO SERVIDOR
client.on("guildCreate", (guild) => {
  updateServer(guild);
  logEvent({
    server_id: guild.id,
    type: "bot_added",
    detail: `Bot adicionado em ${guild.name}`
  });
});

// MEMBER ENTER
client.on("guildMemberAdd", (member) => {
  updateMembers(member.guild);
  logEvent({
    server_id: member.guild.id,
    type: "member_join",
    user_id: member.id,
    detail: `${member.user.username} entrou`
  });
});

// MEMBER SAI
client.on("guildMemberRemove", (member) => {
  updateMembers(member.guild);
  logEvent({
    server_id: member.guild.id,
    type: "member_leave",
    user_id: member.id,
    detail: `${member.user.username} saiu`
  });
});

// SPAM / SUSPICIOUS
function isSuspicious(content) {
  if (!content) return false;
  if (/discord\.gg|invite/g.test(content)) return true;
  if ((content.match(/https:\/\//g) || []).length >= 3) return true;
  return false;
}

client.on("messageCreate", (msg) => {
  if (!msg.guild || msg.author.bot) return;
  if (isSuspicious(msg.content)) {
    logEvent({
      server_id: msg.guild.id,
      type: "suspicious_message",
      user_id: msg.author.id,
      detail: msg.content,
      metadata: { channel: msg.channel.id }
    });
  }
});

// LOGIN
client.login(DISCORD_TOKEN);


