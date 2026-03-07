const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField
} = require('discord.js');

const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;

// --- BANCOS DE DADOS ---
let pontos = {};
let configs = {};

try { pontos = JSON.parse(fs.readFileSync("pontos.json")); } catch { pontos = {}; }
try { configs = JSON.parse(fs.readFileSync("configs.json")); } catch { configs = {}; }

function salvarPontos() { fs.writeFileSync("pontos.json", JSON.stringify(pontos, null, 2)); }
function salvarConfigs() { fs.writeFileSync("configs.json", JSON.stringify(configs, null, 2)); }

function formatarTempo(ms) {
  if (!ms || ms < 0) return "0h 0m";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// --- FUNÇÕES DE ATUALIZAÇÃO ---
async function atualizarRanking(guild) {
  const config = configs[guild.id];
  if (!config || !config.CANAL_RANKING) return;

  try {
    const canal = await guild.channels.fetch(config.CANAL_RANKING);
    if (!canal) return;

    const serverPontos = pontos[guild.id] || {};
    let lista = Object.entries(serverPontos)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    let texto = lista.length === 0 ? ">>> 🏜️ *Nenhum registro de horas ainda.*" : "";
    const medalhas = ["🥇", "🥈", "🥉"];

    for (let i = 0; i < lista.length; i++) {
      const p = lista[i][1];
      const nome = p.nome || "Mecânico";
      const icone = medalhas[i] || "🏅";
      texto += `${icone} **${i + 1}º** — **${nome}**\n└ ⏱ \`${formatarTempo(p.total)}\`\n\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle("🏆 | RANKING DA MECÂNICA")
      .setDescription(`*Os mecânicos mais dedicados da cidade!*\n\n${texto}`)
      .setColor("#FFD700")
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setFooter({ text: "Atualizado em tempo real" })
      .setTimestamp();

    const msgs = await canal.messages.fetch({ limit: 10 });
    const antiga = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("RANKING"));

    if (antiga) await antiga.edit({ embeds: [embed] });
    else await canal.send({ embeds: [embed] });
  } catch (e) { console.log("Erro ranking:", e.message); }
}

async function atualizarPainelAdmin(guild) {
  const config = configs[guild.id];
  if (!config || !config.CANAL_ADMIN) return;

  try {
    const canal = await guild.channels.fetch(config.CANAL_ADMIN);
    if (!canal) return;

    let textoServico = "";
    const agora = Date.now();
    let opcoesSelect = [];
    const serverPontos = pontos[guild.id] || {};

    for (const [userId, p] of Object.entries(serverPontos)) {
      if (p.ativo) {
        const tempo = agora - p.inicio - (p.pausas || 0);
        const status = p.pausado ? "🟡 *Pausado*" : "🟢 *Trabalhando*";
        textoServico += `👤 **${p.nome}**\n└ ${status} | Início: <t:${Math.floor(p.inicio/1000)}:t> | Atual: \`${formatarTempo(tempo)}\`\n\n`;
      }
      if (opcoesSelect.length < 25) {
        opcoesSelect.push(new StringSelectMenuOptionBuilder()
          .setLabel(p.nome || "Mecânico")
          .setDescription(`Total: ${formatarTempo(p.total)}`)
          .setValue(userId)
          .setEmoji(p.ativo ? (p.pausado ? '🟡' : '🟢') : '🔴'));
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🛠️ | PAINEL DE ADMINISTRAÇÃO")
      .setDescription(`**Em serviço agora:**\n\n${textoServico || ">>> 💤 *Ninguém em serviço.*"}`)
      .setColor("#2B2D31");

    const components = [];
    if (opcoesSelect.length > 0) {
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('admin_select_user').setPlaceholder('🔧 Gerenciar mecânico...').addOptions(opcoesSelect)
      ));
    }
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("stats_global").setLabel("Estatísticas").setStyle(ButtonStyle.Secondary).setEmoji("📊"),
      new ButtonBuilder().setCustomId("reset_global").setLabel("Resetar Dados").setStyle(ButtonStyle.Danger).setEmoji("⚠️")
    ));

    const msgs = await canal.messages.fetch({ limit: 10 });
    const antiga = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("ADMINISTRAÇÃO"));

    if (antiga) await antiga.edit({ embeds: [embed], components });
    else await canal.send({ embeds: [embed], components });
  } catch (e) { console.log("Erro painel admin:", e.message); }
}

// --- EVENTOS ---
client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} online!`);
  await client.application.commands.set([
    { name: 'setup', description: 'Configura o bot no servidor' },
    { name: 'painel', description: 'Envia o painel de bater ponto' }
  ]);
  setInterval(() => {
    client.guilds.cache.forEach(guild => {
      atualizarPainelAdmin(guild);
      atualizarRanking(guild);
    });
  }, 60000);
});

client.on("interactionCreate", async interaction => {
  const { member, guild, customId } = interaction;
  if (!guild) return;

  if (!pontos[guild.id]) pontos[guild.id] = {};
  const serverPontos = pontos[guild.id];
  const config = configs[guild.id] || {};

  // Lógica de Permissão Unificada
  const eAdmin = () => {
    const temPermissao = member.permissions.has(PermissionsBitField.Flags.Administrator);
    const temCargo = config.CARGO_ADMIN && member.roles.cache.has(config.CARGO_ADMIN);
    return temPermissao || temCargo;
  };

  // 1. SLASH COMMANDS
  if (interaction.isChatInputCommand()) {
    if (!eAdmin()) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

    if (interaction.commandName === 'setup') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("setup_canais").setLabel("Canais").setStyle(ButtonStyle.Primary).setEmoji("📁"),
        new ButtonBuilder().setCustomId("setup_cargos").setLabel("Cargos").setStyle(ButtonStyle.Secondary).setEmoji("👥")
      );
      return interaction.reply({ content: "⚙️ **Configuração Overspeed**", components: [row], ephemeral: true });
    }

    if (interaction.commandName === 'painel') {
      if (!config.CANAL_PAINEL) return interaction.reply({ content: "❌ Configure os canais no `/setup`.", ephemeral: true });
      const canal = await guild.channels.fetch(config.CANAL_PAINEL);
      const embed = new EmbedBuilder()
        .setTitle("🔧 SISTEMA DE PONTO")
        .setDescription("🟢 `Iniciar` | ⏸️ `Pausar` | ▶️ `Retomar` | 🔴 `Finalizar`")
        .setColor("#E67E22");
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("iniciar").setLabel("Iniciar").setStyle(ButtonStyle.Success).setEmoji("🟢"),
        new ButtonBuilder().setCustomId("pausar").setLabel("Pausar").setStyle(ButtonStyle.Secondary).setEmoji("⏸️"),
        new ButtonBuilder().setCustomId("retomar").setLabel("Retomar").setStyle(ButtonStyle.Primary).setEmoji("▶️"),
        new ButtonBuilder().setCustomId("finalizar").setLabel("Finalizar").setStyle(ButtonStyle.Danger).setEmoji("🔴")
      );
      await canal.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: "✅ Painel enviado!", ephemeral: true });
    }
  }

  // 2. BOTÕES E MODAIS
  if (interaction.isButton()) {
    // Ações de Ponto
    if (["iniciar", "pausar", "retomar", "finalizar"].includes(customId)) {
      if (!config.CARGO_MECANICO || !member.roles.cache.has(config.CARGO_MECANICO)) 
        return interaction.reply({ content: "❌ Apenas mecânicos!", ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      if (!serverPontos[member.id]) serverPontos[member.id] = { total: 0, ativo: false, inicio: null, pausado: false, pausas: 0, nome: member.displayName };
      const p = serverPontos[member.id];
      p.nome = member.displayName;
      const agora = Date.now();

      if (customId === "iniciar") {
        if (p.ativo) return interaction.editReply("⚠️ Já iniciado.");
        p.ativo = true; p.inicio = agora; p.pausas = 0; p.pausado = false;
        interaction.editReply("🟢 Ponto iniciado!");
      } 
      else if (customId === "pausar") {
        if (!p.ativo || p.pausado) return interaction.editReply("⚠️ Não pode pausar.");
        p.pausado = true; p.pausaInicio = agora;
        interaction.editReply("⏸️ Pausa iniciada.");
      } 
      else if (customId === "retomar") {
        if (!p.pausado) return interaction.editReply("⚠️ Não está em pausa.");
        p.pausado = false; p.pausas += (agora - p.pausaInicio);
        interaction.editReply("▶️ Ponto retomado!");
      } 
      else if (customId === "finalizar") {
        if (!p.ativo) return interaction.editReply("⚠️ Não iniciado.");
        const totalSessao = agora - p.inicio - p.pausas;
        p.total += totalSessao;
        if (config.CANAL_LOGS) {
          const logCanal = await guild.channels.fetch(config.CANAL_LOGS);
          const logEmbed = new EmbedBuilder().setTitle("🔴 Ponto Finalizado").setColor("#FF0000")
            .addFields({ name: "👤 Mecânico", value: `<@${member.id}>` }, { name: "⌚ Tempo", value: `\`${formatarTempo(totalSessao)}\`` });
          await logCanal.send({ embeds: [logEmbed] });
        }
        p.ativo = false; p.inicio = null; p.pausado = false; p.pausas = 0;
        interaction.editReply("🔴 Ponto finalizado!");
      }
      salvarPontos();
      return;
    }

    // Ações Admin
    if (!eAdmin()) return interaction.reply({ content: "❌ Acesso negado.", ephemeral: true });

    if (customId === "setup_canais") {
      const modal = new ModalBuilder().setCustomId('modal_canais').setTitle('Configurar Canais');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CANAL_ADMIN').setLabel("ID Canal Admin").setStyle(TextInputStyle.Short).setValue(config.CANAL_ADMIN || "")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CANAL_PAINEL').setLabel("ID Canal Painel").setStyle(TextInputStyle.Short).setValue(config.CANAL_PAINEL || "")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CANAL_LOGS').setLabel("ID Canal Logs").setStyle(TextInputStyle.Short).setValue(config.CANAL_LOGS || "")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CANAL_RANKING').setLabel("ID Canal Ranking").setStyle(TextInputStyle.Short).setValue(config.CANAL_RANKING || ""))
      );
      return interaction.showModal(modal);
    }

    if (customId === "setup_cargos") {
      const modal = new ModalBuilder().setCustomId('modal_cargos').setTitle('Configurar Cargos');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CARGO_ADMIN').setLabel("ID Cargo Admin").setStyle(TextInputStyle.Short).setValue(config.CARGO_ADMIN || "")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CARGO_MECANICO').setLabel("ID Cargo Mecânico").setStyle(TextInputStyle.Short).setValue(config.CARGO_MECANICO || ""))
      );
      return interaction.showModal(modal);
    }

    if (customId === "stats_global") {
      const ativos = Object.values(serverPontos).filter(p => p.ativo).length;
      return interaction.reply({ content: `📊 **Estatísticas:** \`${ativos}\` mecânicos em serviço.`, ephemeral: true });
    }

    if (customId === "reset_global") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("confirm_reset").setLabel("Sim, Resetar").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("cancel_reset").setLabel("Cancelar").setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ content: "⚠️ **CONFIRMAÇÃO:** Deseja resetar TODOS os dados de horas?", components: [row], ephemeral: true });
    }

    if (customId === "confirm_reset") {
      pontos[guild.id] = {}; salvarPontos();
      return interaction.update({ content: "✅ Dados resetados!", components: [] });
    }

    if (customId === "cancel_reset") {
      return interaction.update({ content: "❌ Reset cancelado.", components: [] });
    }

    if (customId.startsWith("force_stop_")) {
      const id = customId.split("_")[2];
      const p = serverPontos[id];
      if (p?.ativo) {
        p.total += (Date.now() - p.inicio - p.pausas);
        p.ativo = false; p.inicio = null;
        salvarPontos();
        return interaction.reply({ content: "⛔ Ponto encerrado.", ephemeral: true });
      }
    }
  }

  // 3. SELEÇÃO DE USUÁRIO (ADMIN)
  if (interaction.isStringSelectMenu() && customId === 'admin_select_user') {
    if (!eAdmin()) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
    const id = interaction.values[0];
    const p = serverPontos[id];
    const embed = new EmbedBuilder().setTitle(`Gerenciando: ${p.nome}`).setDescription(`Total: \`${formatarTempo(p.total)}\``).setColor("#9B59B6");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`force_stop_${id}`).setLabel("Forçar Parada").setStyle(ButtonStyle.Danger).setEmoji("⛔")
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // 4. SUBMISSÃO DE MODAIS
  if (interaction.isModalSubmit()) {
    if (customId === 'modal_canais' || customId === 'modal_cargos') {
      if (!configs[guild.id]) configs[guild.id] = {};
      interaction.fields.fields.forEach(f => configs[guild.id][f.customId] = f.value.trim());
      salvarConfigs();
      return interaction.reply({ content: "✅ Configurações salvas!", ephemeral: true });
    }
  }
});

client.login(TOKEN);
