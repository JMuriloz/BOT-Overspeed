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
    GatewayIntentBits.GuildMessages
  ]
});

const TOKEN = process.env.TOKEN;

// 👇 COLOQUE SEU ID DO DISCORD AQUI DENTRO DAS ASPAS 👇
const BOT_OWNER_ID = '853991179149246505'; 

// --- GARANTIR QUE OS ARQUIVOS EXISTAM ---
if (!fs.existsSync("pontos.json")) fs.writeFileSync("pontos.json", "{}");
if (!fs.existsSync("configs.json")) fs.writeFileSync("configs.json", "{}");

// --- BANCOS DE DADOS ---
let pontos = {};
let configs = {};

try { pontos = JSON.parse(fs.readFileSync("pontos.json")); } catch { pontos = {}; }
try { configs = JSON.parse(fs.readFileSync("configs.json")); } catch { configs = {}; }

function salvarPontos() { fs.writeFileSync("pontos.json", JSON.stringify(pontos, null, 2)); }
function salvarConfigs() { fs.writeFileSync("configs.json", JSON.stringify(configs, null, 2)); }

function formatarTempo(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// --- FUNÇÕES DE SEGURANÇA ---
function isAdmin(member, user, config) {
  if (user.id === BOT_OWNER_ID) return true;
  return member.permissions.has(PermissionsBitField.Flags.Administrator) || (config.CARGO_ADMIN && member.roles.cache.has(config.CARGO_ADMIN));
}

function isMecanico(member, user, config) {
  if (user.id === BOT_OWNER_ID) return true;
  return member.permissions.has(PermissionsBitField.Flags.Administrator) || (config.CARGO_MECANICO && member.roles.cache.has(config.CARGO_MECANICO));
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
      const nome = p.nome || "Mecânico Desconhecido";
      const icone = medalhas[i] || "🏅";
      texto += `${icone} **${i + 1}º** — **${nome}**\n└ ⏱ \`${formatarTempo(p.total)}\`\n\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle("🏆 | RANKING DA MECÂNICA")
      .setDescription(`*Os mecânicos mais dedicados da cidade!*\n\n${texto}`)
      .setColor("#FFD700")
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setFooter({ text: "Atualizado em tempo real", iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    const msgs = await canal.messages.fetch({ limit: 10 });
    const antiga = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("RANKING"));

    if (antiga) await antiga.edit({ embeds: [embed] });
    else await canal.send({ embeds: [embed] });
  } catch (error) { console.log(`Erro ranking: ${error.message}`); }
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
        textoServico += `👤 **${p.nome}**\n└ Status: ${status} | Início: <t:${Math.floor(p.inicio / 1000)}:t> | Atual: \`${formatarTempo(tempo)}\`\n\n`;
      }
      if (opcoesSelect.length < 25) {
        opcoesSelect.push(new StringSelectMenuOptionBuilder()
          .setLabel(p.nome || "Mecânico")
          .setDescription(`Total: ${formatarTempo(p.total)}`)
          .setValue(userId)
          .setEmoji(p.ativo ? (p.pausado ? '🟡' : '🟢') : '🔴')
        );
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🛠️ | PAINEL DE ADMINISTRAÇÃO")
      .setDescription(`**Mecânicos em serviço agora:**\n\n${textoServico || ">>> 💤 *Nenhum mecânico em serviço.*"}`)
      .setColor("#2B2D31")
      .setFooter({ text: "Use o menu abaixo para gerenciar a equipe" });

    let components = [];
    if (opcoesSelect.length > 0) {
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('admin_select_user').setPlaceholder('🔧 Selecione um mecânico...').addOptions(opcoesSelect)
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
  } catch (error) { console.log(`Erro painel admin: ${error.message}`); }
}

// --- INICIALIZAÇÃO ---
client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
  await client.application.commands.set([
    { name: 'setup', description: 'Abre o painel de configuração de IDs do servidor' },
    { name: 'painel', description: 'Envia o painel de "Bater Ponto" no canal configurado' }
  ]);
  setInterval(() => {
    client.guilds.cache.forEach(guild => {
      atualizarPainelAdmin(guild);
      atualizarRanking(guild);
    });
  }, 60000);
});

// --- EVENTOS DE INTERAÇÃO ---
client.on("interactionCreate", async interaction => {
  const { member, guild, user, customId } = interaction;
  if (!guild || !member) return;

  if (!pontos[guild.id]) pontos[guild.id] = {};
  const serverPontos = pontos[guild.id];
  const config = configs[guild.id] || {};

  // 1. SLASH COMMANDS
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup') {
      if (!isAdmin(member, user, config)) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("setup_canais").setLabel("Canais").setStyle(ButtonStyle.Primary).setEmoji("📁"),
        new ButtonBuilder().setCustomId("setup_cargos").setLabel("Cargos").setStyle(ButtonStyle.Secondary).setEmoji("👥")
      );
      return interaction.reply({ content: "⚙️ **Configuração de IDs**", components: [row], ephemeral: true });
    }

    if (interaction.commandName === 'painel') {
      if (!isAdmin(member, user, config)) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
      if (!config.CANAL_PAINEL) return interaction.reply({ content: "❌ Configure os canais no `/setup`.", ephemeral: true });
      
      const canal = await guild.channels.fetch(config.CANAL_PAINEL);
      const embed = new EmbedBuilder()
        .setTitle("🔧 SISTEMA DE PONTO — MECÂNICA")
        .setColor("#E67E22")
        .setDescription("### 🕒 Gerenciamento de Expediente\n🟢 `Iniciar` | ⏸️ `Pausar` | ▶️ `Retomar` | 🔴 `Finalizar`")
        .setFooter({ text: "Oficina Integrada", iconURL: guild.iconURL() }).setTimestamp();

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
    
    // --- SEGURANÇA NO RESET ---
    if (customId === "reset_global") {
      if (!isAdmin(member, user, config)) return interaction.reply({ content: "❌ Apenas administradores!", ephemeral: true });
      const embedConfirm = new EmbedBuilder()
        .setTitle("⚠️ Confirmação de Reset")
        .setDescription("Tem certeza que deseja apagar **TODAS** as horas de todos os mecânicos? Isso não pode ser desfeito.")
        .setColor("#FF0000");
      const rowConfirm = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("confirm_reset").setLabel("Sim, Resetar Tudo").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("cancel_reset").setLabel("Cancelar").setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ embeds: [embedConfirm], components: [rowConfirm], ephemeral: true });
    }

    if (customId === "confirm_reset") {
      if (!isAdmin(member, user, config)) return;
      pontos[guild.id] = {}; salvarPontos();
      atualizarRanking(guild); atualizarPainelAdmin(guild);
      return interaction.update({ content: "✅ **Banco de dados resetado!**", embeds: [], components: [] });
    }

    if (customId === "cancel_reset") {
      return interaction.update({ content: "Ação cancelada.", embeds: [], components: [] });
    }

    // --- SETUP ---
    if (customId.startsWith("setup_")) {
      if (!isAdmin(member, user, config)) return interaction.reply({ content: "❌ Acesso negado.", ephemeral: true });
      if (customId === "setup_canais") {
        const modal = new ModalBuilder().setCustomId('modal_canais').setTitle('Configurar Canais');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CANAL_ADMIN').setLabel("ID Canal Admin").setStyle(TextInputStyle.Short).setValue(config.CANAL_ADMIN || "")),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CANAL_PAINEL').setLabel("ID Canal Ponto").setStyle(TextInputStyle.Short).setValue(config.CANAL_PAINEL || "")),
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
    }

    // --- ENCERRAMENTO FORÇADO (LOGS ADICIONADAS AQUI) ---
    if (customId.startsWith("force_stop_")) {
      if (!isAdmin(member, user, config)) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
      const alvoId = customId.split("_")[2];
      const p = serverPontos[alvoId];
      if (!p?.ativo) return interaction.reply({ content: "❌ Não está em serviço.", ephemeral: true });

      const agora = Date.now();
      const tempoSessao = agora - p.inicio - (p.pausas || 0);
      p.total += tempoSessao;

      // Enviar Log de Encerramento Forçado
      if (config.CANAL_LOGS) {
        try {
          const logCanal = await guild.channels.fetch(config.CANAL_LOGS);
          const embedLog = new EmbedBuilder()
            .setTitle("⛔ | PONTO ENCERRADO FORÇADAMENTE")
            .setColor("#FF4500")
            .setThumbnail(guild.iconURL())
            .addFields(
              { name: "👤 Mecânico", value: `<@${alvoId}>`, inline: true },
              { name: "👮 Admin Responsável", value: `<@${user.id}>`, inline: true },
              { name: "⌚ Tempo da Sessão", value: `\`${formatarTempo(tempoSessao)}\`` },
              { name: "📈 Total Acumulado", value: `\`${formatarTempo(p.total)}\`` },
              { name: "🕒 Horário", value: `<t:${Math.floor(agora/1000)}:F>` }
            )
            .setFooter({ text: "Ação Administrativa" })
            .setTimestamp();
          await logCanal.send({ embeds: [embedLog] });
        } catch (e) { console.log("Erro log force stop:", e); }
      }

      p.ativo = false; p.inicio = null; p.pausado = false; p.pausas = 0;
      salvarPontos(); atualizarRanking(guild); atualizarPainelAdmin(guild);
      return interaction.reply({ content: `⛔ Ponto de <@${alvoId}> encerrado e registrado nas logs!`, ephemeral: true });
    }

    // --- PONTO ---
    if (["iniciar", "pausar", "retomar", "finalizar"].includes(customId)) {
      if (!isMecanico(member, user, config)) return interaction.reply({ content: "❌ Apenas mecânicos!", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      
      if (!serverPontos[user.id]) serverPontos[user.id] = { total: 0, ativo: false, inicio: null, pausado: false, pausas: 0, nome: member.displayName };
      const p = serverPontos[user.id];
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
        interaction.editReply("▶️ Retomado!");
      } 
      else if (customId === "finalizar") {
        if (!p.ativo) return interaction.editReply("⚠️ Não iniciado.");
        const tempoSessao = agora - p.inicio - (p.pausas || 0);
        p.total += tempoSessao;

        if (config.CANAL_LOGS) {
          try {
            const logCanal = await guild.channels.fetch(config.CANAL_LOGS);
            const logEmbed = new EmbedBuilder()
              .setTitle("📋 | REGISTRO DE EXPEDIENTE")
              .setColor("#2ECC71")
              .addFields(
                { name: "👤 Mecânico", value: `<@${user.id}>` },
                { name: "⌚ Tempo Trabalhado", value: `\`${formatarTempo(tempoSessao)}\`` },
                { name: "📈 Total Rank", value: `\`${formatarTempo(p.total)}\`` }
              ).setTimestamp();
            await logCanal.send({ embeds: [logEmbed] });
          } catch (e) {}
        }
        p.ativo = false; p.inicio = null; p.pausado = false; p.pausas = 0;
        interaction.editReply("🔴 Ponto finalizado e log enviado!");
      }
      salvarPontos(); atualizarPainelAdmin(guild); atualizarRanking(guild);
    }
  }

  // 3. SELEÇÃO DE USUÁRIO & MODAIS
  if (interaction.isStringSelectMenu() && customId === 'admin_select_user') {
    if (!isAdmin(member, user, config)) return interaction.reply({ content: "❌ Negado.", ephemeral: true });
    const p = serverPontos[interaction.values[0]];
    const embed = new EmbedBuilder().setTitle(`Gerenciar: ${p.nome}`).setDescription(`Total: \`${formatarTempo(p.total)}\``).setColor("#9B59B6");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`force_stop_${interaction.values[0]}`).setLabel("Encerrar Ponto").setStyle(ButtonStyle.Danger).setEmoji("⛔")
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  if (interaction.isModalSubmit()) {
    if (!configs[guild.id]) configs[guild.id] = {};
    interaction.fields.fields.forEach(f => configs[guild.id][f.customId] = f.value.trim());
    salvarConfigs();
    return interaction.reply({ content: "✅ Configurações salvas!", ephemeral: true });
  }
});

client.login(TOKEN);
