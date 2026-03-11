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
  // Evita exibir números negativos caso haja algum erro de cálculo
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// --- FUNÇÕES DE SEGURANÇA (O Dono do bot sempre tem permissão) ---
function isAdmin(member, user, config) {
  if (user.id === BOT_OWNER_ID) return true; // Você sempre terá acesso
  return member.permissions.has(PermissionsBitField.Flags.Administrator) || (config.CARGO_ADMIN && member.roles.cache.has(config.CARGO_ADMIN));
}

function isMecanico(member, user, config) {
  if (user.id === BOT_OWNER_ID) return true; // Você sempre terá acesso
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
  } catch (error) {
    console.log(`Erro ao atualizar ranking no servidor ${guild.name}`);
  }
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
      const nome = p.nome || "Mecânico";

      if (p.ativo) {
        // Correção visual no painel: se pausado, congela o tempo na hora que pausou
        const tempo = p.pausado 
          ? p.pausaInicio - p.inicio - p.pausas 
          : agora - p.inicio - p.pausas;

        const inicioTempo = `<t:${Math.floor(p.inicio / 1000)}:t>`;
        const status = p.pausado ? "🟡 *Pausado*" : "🟢 *Trabalhando*";
        
        textoServico += `👤 **${nome}**\n└ Status: ${status} | Início: ${inicioTempo} | Atual: \`${formatarTempo(tempo)}\`\n\n`;
      }

      if (opcoesSelect.length < 25) {
        opcoesSelect.push(
          new StringSelectMenuOptionBuilder()
            .setLabel(nome)
            .setDescription(`Total: ${formatarTempo(p.total)}`)
            .setValue(userId)
            .setEmoji(p.ativo ? (p.pausado ? '🟡' : '🟢') : '🔴')
        );
      }
    }

    if (textoServico === "") textoServico = ">>> 💤 *Nenhum mecânico em serviço no momento.*";

    const embed = new EmbedBuilder()
      .setTitle("🛠️ | PAINEL DE ADMINISTRAÇÃO")
      .setDescription(`**Mecânicos em serviço agora:**\n\n${textoServico}`)
      .setColor("#2B2D31")
      .setFooter({ text: "Use o menu abaixo para gerenciar a equipe" });

    let components = [];

    if (opcoesSelect.length > 0) {
      const select = new StringSelectMenuBuilder()
        .setCustomId('admin_select_user')
        .setPlaceholder('🔧 Selecione um mecânico...')
        .addOptions(opcoesSelect);
      components.push(new ActionRowBuilder().addComponents(select));
    }

    const botoesGlobais = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("stats_global").setLabel("Estatísticas").setStyle(ButtonStyle.Secondary).setEmoji("📊"),
      new ButtonBuilder().setCustomId("reset_global").setLabel("Resetar Dados").setStyle(ButtonStyle.Danger).setEmoji("⚠️")
    );
    components.push(botoesGlobais);

    const msgs = await canal.messages.fetch({ limit: 10 });
    const antiga = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("ADMINISTRAÇÃO"));

    if (antiga) {
      await antiga.edit({ embeds: [embed], components });
    } else {
      await canal.send({ embeds: [embed], components });
    }
  } catch (error) {
    console.log(`Erro ao atualizar painel admin no servidor ${guild.name}`);
  }
}

// --- INICIALIZAÇÃO ---
client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  await client.application.commands.set([
    {
      name: 'setup',
      description: 'Abre o painel de configuração de IDs do servidor'
    },
    {
      name: 'painel',
      description: 'Envia o painel de "Bater Ponto" no canal configurado'
    }
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
  if (!guild || !member) return; // Garante que temos as info do membro

  if (!pontos[guild.id]) pontos[guild.id] = {};
  const serverPontos = pontos[guild.id];
  const config = configs[guild.id] || {};

  // 1. SLASH COMMANDS
  if (interaction.isChatInputCommand()) {
    
    if (interaction.commandName === 'setup') {
      if (!isAdmin(member, user, config)) {
        return interaction.reply({ content: "❌ Apenas administradores ou o dono do bot podem usar isso.", ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle("⚙️ Setup da Mecânica")
        .setDescription("Clique nos botões abaixo para configurar os canais e cargos do sistema.")
        .setColor("#3498DB");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("setup_canais").setLabel("Configurar Canais").setStyle(ButtonStyle.Primary).setEmoji("📁"),
        new ButtonBuilder().setCustomId("setup_cargos").setLabel("Configurar Cargos").setStyle(ButtonStyle.Secondary).setEmoji("👥")
      );

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (interaction.commandName === 'painel') {
      if (!isAdmin(member, user, config)) {
        return interaction.reply({ content: "❌ Apenas administradores ou o dono do bot podem enviar o painel.", ephemeral: true });
      }

      if (!config.CANAL_PAINEL) return interaction.reply({ content: "❌ O **Canal do Painel** não foi configurado no `/setup` ainda.", ephemeral: true });
      
      try {
        const canalPainel = await guild.channels.fetch(config.CANAL_PAINEL);
        
        const embed = new EmbedBuilder()
          .setTitle("🔧 SISTEMA DE PONTO — MECÂNICA")
          .setColor("#E67E22")
          .setDescription(
            "### 🕒 Gerenciamento de Expediente\n" +
            "Seja bem-vindo ao sistema de controle de horas. Utilize os controles abaixo para gerenciar seu turno.\n\n" +
            "**Guia de Operação:**\n" +
            "🟢 `Iniciar` — Registra sua entrada e começa a contar seu tempo.\n" +
            "⏸️ `Pausar` — Utilize para intervalos. O tempo para de contar.\n" +
            "▶️ `Retomar` — Finaliza sua pausa e volta a trabalhar.\n" +
            "🔴 `Finalizar` — Encerra o turno e envia para as logs.\n\n" +
            "--- \n" +
            "⚠️ **Atenção:** *Lembre-se de finalizar o ponto antes de sair da cidade!*"
          )
          .setFooter({ text: "Oficina Integrada • Sistema de Gerenciamento", iconURL: guild.iconURL() })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("iniciar").setLabel("Iniciar").setStyle(ButtonStyle.Success).setEmoji("🟢"),
          new ButtonBuilder().setCustomId("pausar").setLabel("Pausar").setStyle(ButtonStyle.Secondary).setEmoji("⏸️"),
          new ButtonBuilder().setCustomId("retomar").setLabel("Retomar").setStyle(ButtonStyle.Primary).setEmoji("▶️"),
          new ButtonBuilder().setCustomId("finalizar").setLabel("Finalizar").setStyle(ButtonStyle.Danger).setEmoji("🔴")
        );

        await canalPainel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: `✅ Painel enviado em <#${config.CANAL_PAINEL}>!`, ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: "❌ Erro ao enviar o painel. Verifique as permissões do bot.", ephemeral: true });
      }
    }
  }

  // 2. ABRIR MODAIS DE SETUP
  if (interaction.isButton() && customId.startsWith("setup_")) {
    if (!isAdmin(member, user, config)) {
      return interaction.reply({ content: "❌ Acesso negado.", ephemeral: true });
    }

    if (customId === "setup_canais") {
      const modal = new ModalBuilder().setCustomId('modal_configs_canais').setTitle('Configurar Canais (IDs)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CANAL_ADMIN').setLabel("ID do Canal Admin").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CANAL_ADMIN || "")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CANAL_PAINEL').setLabel("ID do Canal de Bater Ponto").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CANAL_PAINEL || "")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CANAL_LOGS').setLabel("ID do Canal de Logs").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CANAL_LOGS || "")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CANAL_RANKING').setLabel("ID do Canal de Ranking").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CANAL_RANKING || ""))
      );
      return interaction.showModal(modal);
    }

    if (customId === "setup_cargos") {
      const modal = new ModalBuilder().setCustomId('modal_configs_cargos').setTitle('Configurar Cargos (IDs)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CARGO_ADMIN').setLabel("ID do Cargo Admin/Chefe").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CARGO_ADMIN || "")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('CARGO_MECANICO').setLabel("ID do Cargo Mecânico").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CARGO_MECANICO || ""))
      );
      return interaction.showModal(modal);
    }
  }

  // 3. SALVAR MODAIS
  if (interaction.isModalSubmit()) {
    if (customId === 'modal_configs_canais' || customId === 'modal_configs_cargos') {
      if (!configs[guild.id]) configs[guild.id] = {};
      interaction.fields.fields.forEach((field) => { configs[guild.id][field.customId] = field.value.trim(); });
      salvarConfigs();
      atualizarPainelAdmin(guild); 
      atualizarRanking(guild);
      return interaction.reply({ content: `✅ **Configurações salvas!** Agora o sistema já deve reconhecer os cargos novamente.`, ephemeral: true });
    }

    if (customId.startsWith("modal_add") || customId.startsWith("modal_rem")) {
      const alvoId = customId.split("_")[2];
      const minutos = parseInt(interaction.fields.getTextInputValue('input_minutos'));
      if (isNaN(minutos) || minutos <= 0) return interaction.reply({ content: "❌ Digite um número válido.", ephemeral: true });
      const ms = minutos * 60000; 

      if (customId.startsWith("modal_add")) {
        serverPontos[alvoId].total += ms;
        salvarPontos(); atualizarRanking(guild); atualizarPainelAdmin(guild);
        return interaction.reply({ content: `✅ Adicionado \`${minutos}m\` para o mecânico.`, ephemeral: true });
      }
      if (customId.startsWith("modal_rem")) {
        serverPontos[alvoId].total = Math.max(0, serverPontos[alvoId].total - ms);
        salvarPontos(); atualizarRanking(guild); atualizarPainelAdmin(guild);
        return interaction.reply({ content: `✅ Removido \`${minutos}m\` do mecânico.`, ephemeral: true });
      }
    }
  }

  // 4. DROPDOWN ADMIN
  if (interaction.isStringSelectMenu() && customId === 'admin_select_user') {
    if (!isAdmin(member, user, config)) return interaction.reply({ content: "❌ Acesso negado.", ephemeral: true });
    const selectedUserId = interaction.values[0];
    const p = serverPontos[selectedUserId];
    const statusTexto = p.ativo ? (p.pausado ? "🟡 Pausado" : "🟢 Em Serviço") : "🔴 Fora de Serviço";

    const embedInfo = new EmbedBuilder()
      .setTitle(`⚙️ Gerenciando: ${p.nome || "Mecânico"}`)
      .setColor("#9B59B6")
      .addFields(
        { name: "⏱️ Horas Totais", value: `\`${formatarTempo(p.total)}\``, inline: true },
        { name: "📡 Status", value: `**${statusTexto}**`, inline: true }
      );

    const botoesAcao = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`add_time_${selectedUserId}`).setLabel("Add Tempo").setStyle(ButtonStyle.Success).setEmoji("➕"),
      new ButtonBuilder().setCustomId(`rem_time_${selectedUserId}`).setLabel("Rem Tempo").setStyle(ButtonStyle.Danger).setEmoji("➖"),
      new ButtonBuilder().setCustomId(`force_stop_${selectedUserId}`).setLabel("Encerrar Ponto").setStyle(ButtonStyle.Secondary).setEmoji("⛔")
    );
    return interaction.reply({ embeds: [embedInfo], components: [botoesAcao], ephemeral: true });
  }

  // 5. BOTÕES DE PONTO & ADMIN GLOBAIS
  if (interaction.isButton()) {
    
    if (customId === "reset_global") {
      if (!isAdmin(member, user, config)) return interaction.reply({ content: "❌ Acesso negado. Apenas administradores.", ephemeral: true });
      
      pontos[guild.id] = {}; 
      salvarPontos(); 
      atualizarRanking(guild); 
      atualizarPainelAdmin(guild);
      return interaction.reply({ content: "✅ **Todos os dados de pontos foram resetados com sucesso para o novo evento!**", ephemeral: true });
    }

    if (customId.startsWith("add_time_") || customId.startsWith("rem_time_")) {
      const alvoId = customId.split("_")[2];
      const tipo = customId.startsWith("add") ? "add" : "rem";
      const modal = new ModalBuilder().setCustomId(`modal_${tipo}_${alvoId}`).setTitle(tipo === "add" ? "➕ Adicionar Tempo" : "➖ Remover Tempo");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_minutos').setLabel("Minutos").setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    if (customId.startsWith("force_stop_")) {
      const alvoId = customId.split("_")[2];
      const p = serverPontos[alvoId];
      if (!p?.ativo) return interaction.reply({ content: "❌ Usuário não está em serviço.", ephemeral: true });
      
      const agora = Date.now();

      // CORREÇÃO AQUI: Se forçado enquanto pausado, usa o tempo em que a pausa iniciou.
      const tempoSessao = p.pausado 
        ? p.pausaInicio - p.inicio - (p.pausas || 0)
        : agora - p.inicio - (p.pausas || 0);

      p.total += tempoSessao; 

      if (config.CANAL_LOGS) {
        const agoraData = new Date();
        const horaFooter = agoraData.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const embedLogForcado = new EmbedBuilder()
          .setTitle("⚠️ | REGISTRO ENCERRADO FORÇADAMENTE")
          .setColor("#E74C3C") 
          .addFields(
            { name: "👤 Mecânico", value: `<@${alvoId}> (${p.nome || "Mecânico"})` },
            { name: "🛡️ Admin Responsável", value: `<@${user.id}> (${member.displayName})` },
            { name: "🟢 Início do Turno", value: `<t:${Math.floor(p.inicio / 1000)}:F>`, inline: true },
            { name: "🔴 Fim do Turno (Forçado)", value: `<t:${Math.floor(agora / 1000)}:F>`, inline: true },
            { name: "⌚ Tempo Adicionado", value: `\`${formatarTempo(tempoSessao)}\`` },
            { name: "📈 Total Acumulado no Rank", value: `\`${formatarTempo(p.total)}\`` }
          )
          .setFooter({ text: `Sistema Integrado • Hoje às ${horaFooter}` });

        try { 
          const canalLogs = await guild.channels.fetch(config.CANAL_LOGS);
          await canalLogs.send({ embeds: [embedLogForcado] }); 
        } catch (e) {
          console.log("Erro ao enviar log de ponto forçado:", e);
        }
      }

      p.ativo = false; p.inicio = null; p.pausado = false; p.pausas = 0;
      salvarPontos(); atualizarRanking(guild); atualizarPainelAdmin(guild);
      return interaction.reply({ content: "⛔ **Ponto encerrado forçadamente e registrado nas logs!**", ephemeral: true });
    }

    if (customId === "stats_global") {
      if (!isAdmin(member, user, config)) return interaction.reply({ content: "❌ Acesso negado.", ephemeral: true });
      const emServico = Object.values(serverPontos).filter(p => p.ativo).length;
      return interaction.reply({ content: `📊 **ESTATÍSTICAS:**\n🔧 Em serviço agora: \`${emServico}\``, ephemeral: true });
    }

    if (["iniciar", "pausar", "retomar", "finalizar"].includes(customId)) {
      if (!isMecanico(member, user, config)) return interaction.reply({ content: "❌ Apenas mecânicos podem usar isso.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      
      if (!serverPontos[user.id]) serverPontos[user.id] = { total: 0, ativo: false, inicio: null, pausado: false, pausas: 0, nome: member.displayName };
      serverPontos[user.id].nome = member.displayName; 
      const p = serverPontos[user.id];
      const agora = Date.now();

      if (customId === "iniciar") {
        if (p.ativo) return interaction.editReply("⚠️ Ponto já está aberto!");
        p.ativo = true; p.inicio = agora; p.pausas = 0; p.pausado = false;
        salvarPontos(); atualizarPainelAdmin(guild);
        return interaction.editReply("🟢 **Ponto iniciado!**");
      }
      if (customId === "pausar") {
        if (!p.ativo || p.pausado) return interaction.editReply("⚠️ Não pode pausar agora.");
        p.pausado = true; p.pausaInicio = agora;
        salvarPontos(); atualizarPainelAdmin(guild);
        return interaction.editReply("⏸️ **Pausa iniciada.**");
      }
      if (customId === "retomar") {
        if (!p.pausado) return interaction.editReply("⚠️ Você não está em pausa.");
        p.pausado = false; p.pausas += agora - p.pausaInicio;
        salvarPontos(); atualizarPainelAdmin(guild);
        return interaction.editReply("▶️ **Ponto retomado!**");
      }
      if (customId === "finalizar") {
        if (!p.ativo) return interaction.editReply("⚠️ Ponto não iniciado.");
        
        // CORREÇÃO AQUI: Considera se ele clicou finalizar enquanto estava pausado.
        const tempoSessao = p.pausado 
          ? p.pausaInicio - p.inicio - (p.pausas || 0)
          : agora - p.inicio - (p.pausas || 0);

        p.total += tempoSessao;
        
        if (config.CANAL_LOGS) {
          const agoraData = new Date();
          const horaFooter = agoraData.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          const embedLog = new EmbedBuilder()
            .setTitle("📋 | REGISTRO DE EXPEDIENTE")
            .setColor("#2ECC71")
            .setThumbnail(member.displayAvatarURL({ dynamic: true }))
            .addFields(
              { name: "👤 Mecânico", value: `<@${user.id}> (${member.displayName})` },
              { name: "🟢 Início do Turno", value: `<t:${Math.floor(p.inicio / 1000)}:F>`, inline: true },
              { name: "🔴 Fim do Turno", value: `<t:${Math.floor(agora / 1000)}:F>`, inline: true },
              { name: "⌚ Tempo Trabalhado Agora", value: `\`${formatarTempo(tempoSessao)}\`` },
              { name: "📈 Total Acumulado no Rank", value: `\`${formatarTempo(p.total)}\`` }
            )
            .setFooter({ text: `Sistema Integrado • Hoje às ${horaFooter}` });

          try { 
            const canalLogs = await guild.channels.fetch(config.CANAL_LOGS);
            await canalLogs.send({ embeds: [embedLog] }); 
          } catch (e) {
            console.log("Erro ao enviar log:", e);
          }
        }

        p.ativo = false; p.inicio = null; p.pausado = false; p.pausas = 0;
        salvarPontos(); atualizarRanking(guild); atualizarPainelAdmin(guild);
        return interaction.editReply("🔴 **Ponto finalizado! Registro enviado para as logs.**");
      }
    }
  }
});

client.login(TOKEN);
