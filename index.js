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
  TextInputStyle
} = require('discord.js')

const fs = require('fs')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
})

const TOKEN = process.env.TOKEN

// --- CONFIGURAÇÕES ---
const CANAL_ADMIN = "1479194603918856375"
const CARGO_ADMIN = "1479194635141386312"
const CANAL_PAINEL = "1479180614468108448"
const CANAL_LOGS = "1479141728299516015"
const CANAL_RANKING = "1479141719441408164"
const CARGO_MECANICO = "1479140498131255307"

let pontos = {}

try {
  pontos = JSON.parse(fs.readFileSync("pontos.json"))
} catch {
  pontos = {}
}

function salvar() {
  fs.writeFileSync("pontos.json", JSON.stringify(pontos, null, 2))
}

function formatarTempo(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}

// --- FUNÇÕES DE ATUALIZAÇÃO ---
async function atualizarRanking(guild) {
  const canal = await client.channels.fetch(CANAL_RANKING)
  let lista = Object.entries(pontos)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)

  let texto = lista.length === 0 ? ">>> 🏜️ *Nenhum registro de horas ainda.*" : ""

  const medalhas = ["🥇", "🥈", "🥉"]

  for (let i = 0; i < lista.length; i++) {
    const userId = lista[i][0]
    const p = lista[i][1]
    const nome = p.nome || "Mecânico Desconhecido"
    const icone = medalhas[i] || "🏅"
    
    texto += `${icone} **${i + 1}º** — **${nome}**\n└ ⏱ \`${formatarTempo(p.total)}\`\n\n`
  }

  const embed = new EmbedBuilder()
    .setTitle("🏆 | RANKING DA MECÂNICA")
    .setDescription(`*Os mecânicos mais dedicados da cidade!*\n\n${texto}`)
    .setColor("#FFD700")
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .setFooter({ text: "Atualizado em tempo real", iconURL: client.user.displayAvatarURL() })
    .setTimestamp()

  const msgs = await canal.messages.fetch({ limit: 10 })
  const antiga = msgs.find(m => m.author.id === client.user.id)

  if (antiga) await antiga.edit({ embeds: [embed] })
  else await canal.send({ embeds: [embed] })
}

async function atualizarPainelAdmin(guild) {
  const canal = await client.channels.fetch(CANAL_ADMIN)
  let textoServico = ""
  const agora = Date.now()

  let opcoesSelect = []

  for (const [userId, p] of Object.entries(pontos)) {
    const nome = p.nome || "Mecânico"

    // Monta o texto de quem está em serviço
    if (p.ativo) {
      const tempo = agora - p.inicio - p.pausas
      const inicioTempo = `<t:${Math.floor(p.inicio / 1000)}:t>` // Formato hora Discord
      const status = p.pausado ? "🟡 *Pausado*" : "🟢 *Trabalhando*"
      
      textoServico += `👤 **${nome}**\n└ Status: ${status} | Início: ${inicioTempo} | Atual: \`${formatarTempo(tempo)}\`\n\n`
    }

    // Alimenta o Select Menu com até 25 membros
    if (opcoesSelect.length < 25) {
      opcoesSelect.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(nome)
          .setDescription(`Total: ${formatarTempo(p.total)}`)
          .setValue(userId)
          .setEmoji(p.ativo ? (p.pausado ? '🟡' : '🟢') : '🔴')
      )
    }
  }

  if (textoServico === "") textoServico = ">>> 💤 *Nenhum mecânico em serviço no momento.*"

  const embed = new EmbedBuilder()
    .setTitle("🛠️ | PAINEL DE ADMINISTRAÇÃO")
    .setDescription(`**Mecânicos em serviço agora:**\n\n${textoServico}`)
    .setColor("#2B2D31") // Cor escura padrão do Discord
    .setFooter({ text: "Use o menu abaixo para gerenciar a equipe" })

  let components = []

  if (opcoesSelect.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('admin_select_user')
      .setPlaceholder('🔧 Selecione um mecânico...')
      .addOptions(opcoesSelect)
    
    components.push(new ActionRowBuilder().addComponents(select))
  }

  const botoesGlobais = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("stats_global").setLabel("Estatísticas").setStyle(ButtonStyle.Secondary).setEmoji("📊"),
    new ButtonBuilder().setCustomId("reset_global").setLabel("Resetar Dados").setStyle(ButtonStyle.Danger).setEmoji("⚠️")
  )
  components.push(botoesGlobais)

  const msgs = await canal.messages.fetch({ limit: 10 })
  const antiga = msgs.find(m => m.author.id === client.user.id)

  if (antiga) {
    await antiga.edit({ embeds: [embed], components })
  } else {
    await canal.send({ embeds: [embed], components })
  }
}

// --- INICIALIZAÇÃO ---
client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`)

  const canal = await client.channels.fetch(CANAL_PAINEL)
  const guild = canal.guild

  const msgs = await canal.messages.fetch({ limit: 10 })
  const existe = msgs.find(m => m.author.id === client.user.id)

  if (!existe) {
    const embed = new EmbedBuilder()
      .setTitle("🔧 | BATER PONTO — MECÂNICA")
      .setDescription(">>> Utilize os botões abaixo para gerenciar o seu turno de trabalho. Lembre-se de finalizar ao sair da cidade!")
      .setColor("#E67E22")
      .setImage("https://i.imgur.com/8Q5Z2gA.png") // Você pode trocar por um banner da sua cidade se quiser
      .setFooter({ text: "Sistema Integrado" })

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("iniciar").setLabel("Iniciar").setStyle(ButtonStyle.Success).setEmoji("🟢"),
      new ButtonBuilder().setCustomId("pausar").setLabel("Pausar").setStyle(ButtonStyle.Secondary).setEmoji("⏸️"),
      new ButtonBuilder().setCustomId("retomar").setLabel("Retomar").setStyle(ButtonStyle.Primary).setEmoji("▶️"),
      new ButtonBuilder().setCustomId("finalizar").setLabel("Finalizar").setStyle(ButtonStyle.Danger).setEmoji("🔴")
    )
    const msg = await canal.send({ embeds: [embed], components: [row] })
    msg.pin().catch(() => {})
  }

  atualizarRanking(guild)
  atualizarPainelAdmin(guild)
  setInterval(() => { atualizarPainelAdmin(guild) }, 60000)
})

// --- EVENTOS DE INTERAÇÃO ---
client.on("interactionCreate", async interaction => {
  const { member, guild, user, customId } = interaction

  // 1. TRATAMENTO DO DROPDOWN (Selecionar Mecânico)
  if (interaction.isStringSelectMenu() && customId === 'admin_select_user') {
    if (!member.roles.cache.has(CARGO_ADMIN)) {
      return interaction.reply({ content: "❌ **Acesso negado.** Apenas a administração pode usar isso.", ephemeral: true })
    }

    const selectedUserId = interaction.values[0]
    const p = pontos[selectedUserId]
    const nome = p.nome || "Mecânico Desconhecido"

    let lista = Object.entries(pontos).sort((a, b) => b[1].total - a[1].total)
    let posicao = lista.findIndex(x => x[0] === selectedUserId) + 1

    const statusTexto = p.ativo ? (p.pausado ? "🟡 Pausado" : "🟢 Em Serviço") : "🔴 Fora de Serviço"

    const embedInfo = new EmbedBuilder()
      .setTitle(`⚙️ Gerenciando: ${nome}`)
      .setDescription(`<@${selectedUserId}>`)
      .setColor("#9B59B6")
      .addFields(
        { name: "⏱️ Horas Totais", value: `\`${formatarTempo(p.total)}\``, inline: true },
        { name: "🏆 Posição Rank", value: `\`${posicao}º lugar\``, inline: true },
        { name: "📡 Status Atual", value: `**${statusTexto}**`, inline: true }
      )

    const botoesAcao = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`add_time_${selectedUserId}`).setLabel("Add Tempo").setStyle(ButtonStyle.Success).setEmoji("➕"),
      new ButtonBuilder().setCustomId(`rem_time_${selectedUserId}`).setLabel("Rem Tempo").setStyle(ButtonStyle.Danger).setEmoji("➖"),
      new ButtonBuilder().setCustomId(`force_stop_${selectedUserId}`).setLabel("Encerrar Ponto").setStyle(ButtonStyle.Secondary).setEmoji("⛔")
    )

    return interaction.reply({ embeds: [embedInfo], components: [botoesAcao], ephemeral: true })
  }

  // 2. TRATAMENTO DE MODAIS (Envio de tempo)
  if (interaction.isModalSubmit()) {
    const alvoId = customId.split("_")[2]
    const minutosStr = interaction.fields.getTextInputValue('input_minutos')
    const minutos = parseInt(minutosStr)

    if (isNaN(minutos) || minutos <= 0) {
      return interaction.reply({ content: "❌ **Erro:** Digite um número válido de minutos.", ephemeral: true })
    }

    const ms = minutos * 60000 

    if (customId.startsWith("modal_add")) {
      pontos[alvoId].total += ms
      salvar(); atualizarRanking(guild); atualizarPainelAdmin(guild)
      return interaction.reply({ content: `✅ **Sucesso!** Foi adicionado \`${minutos} minutos\` para o mecânico.`, ephemeral: true })
    }

    if (customId.startsWith("modal_rem")) {
      pontos[alvoId].total = Math.max(0, pontos[alvoId].total - ms)
      salvar(); atualizarRanking(guild); atualizarPainelAdmin(guild)
      return interaction.reply({ content: `✅ **Sucesso!** Foi removido \`${minutos} minutos\` do mecânico.`, ephemeral: true })
    }
  }

  // 3. TRATAMENTO DOS BOTÕES
  if (interaction.isButton()) {
    
    // -- ADMIN --
    if (customId.startsWith("add_time_")) {
      const alvoId = customId.split("_")[2]
      const modal = new ModalBuilder().setCustomId(`modal_add_${alvoId}`).setTitle("➕ Adicionar Tempo")
      const input = new TextInputBuilder().setCustomId('input_minutos').setLabel("Quantos MINUTOS quer adicionar?").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ex: 60 (para 1 hora)")
      modal.addComponents(new ActionRowBuilder().addComponents(input))
      return interaction.showModal(modal)
    }

    if (customId.startsWith("rem_time_")) {
      const alvoId = customId.split("_")[2]
      const modal = new ModalBuilder().setCustomId(`modal_rem_${alvoId}`).setTitle("➖ Remover Tempo")
      const input = new TextInputBuilder().setCustomId('input_minutos').setLabel("Quantos MINUTOS quer remover?").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ex: 30")
      modal.addComponents(new ActionRowBuilder().addComponents(input))
      return interaction.showModal(modal)
    }

    if (customId.startsWith("force_stop_")) {
      await interaction.deferReply({ ephemeral: true })
      const alvoId = customId.split("_")[2]
      const p = pontos[alvoId]
      
      if (!p.ativo) return interaction.editReply("❌ Este usuário já está fora de serviço.")
      
      const agora = Date.now()
      let tempo = agora - p.inicio - p.pausas
      p.total += tempo
      p.ativo = false; p.inicio = null; p.pausado = false; p.pausas = 0
      
      salvar(); atualizarRanking(guild); atualizarPainelAdmin(guild)
      return interaction.editReply("⛔ **Ponto encerrado** forçadamente pela administração.")
    }

if (customId === "stats_global") {
      if (!member.roles.cache.has(CARGO_ADMIN)) return interaction.reply({ content: "❌ Acesso negado.", ephemeral: true })
      
      // Deferir a resposta para o bot pensar sem dar erro de tempo limite
      await interaction.deferReply({ ephemeral: true });

      try {
        // Tenta buscar os membros na API (pode falhar se faltar permissão)
        await guild.members.fetch(); 
      } catch (erro) {
        console.log("⚠️ Aviso: Não foi possível sincronizar todos os membros. Usando dados em cache.");
      }

      const cargoMecanico = guild.roles.cache.get(CARGO_MECANICO);
      const totalMembrosComCargo = cargoMecanico ? cargoMecanico.members.size : 0;

      const emServico = Object.values(pontos).filter(p => p.ativo).length

      return interaction.editReply({ 
        content: `📊 **ESTATÍSTICAS DA MECÂNICA:**\n\n👥 Membros contratados (com cargo): \`${totalMembrosComCargo}\`\n🔧 Em serviço agora: \`${emServico}\`` 
      }).catch(() => {})
    }

    if (customId === "reset_global") {
      if (!member.roles.cache.has(CARGO_ADMIN)) return interaction.reply({ content: "❌ Acesso negado.", ephemeral: true })
      pontos = {}
      salvar(); atualizarRanking(guild); atualizarPainelAdmin(guild)
      return interaction.reply({ content: "⚠️ **ATENÇÃO:** Todos os registros e o ranking foram resetados!", ephemeral: true })
    }

    // -- BATER PONTO (MECÂNICOS) --
    if (["iniciar", "pausar", "retomar", "finalizar"].includes(customId)) {
      await interaction.deferReply({ ephemeral: true })

      if (!member.roles.cache.has(CARGO_MECANICO)) {
        return interaction.editReply("❌ **Acesso negado.** Apenas mecânicos podem bater ponto.")
      }

      // Salva o display name atualizado sempre!
      if (!pontos[user.id]) {
        pontos[user.id] = { total: 0, ativo: false, inicio: null, pausado: false, pausaInicio: null, pausas: 0, nome: member.displayName }
      } else {
        pontos[user.id].nome = member.displayName 
      }

      const p = pontos[user.id]
      const agora = Date.now()

      if (customId === "iniciar") {
        if (p.ativo) return interaction.editReply("⚠️ Você já está com o ponto aberto!")
        p.ativo = true; p.inicio = agora; p.pausas = 0; p.pausado = false
        salvar(); atualizarPainelAdmin(guild)
        return interaction.editReply("🟢 **Ponto iniciado!** Bom trabalho.")
      }

      if (customId === "pausar") {
        if (!p.ativo || p.pausado) return interaction.editReply("⚠️ Não é possível pausar agora.")
        p.pausado = true; p.pausaInicio = agora
        salvar(); atualizarPainelAdmin(guild)
        return interaction.editReply("⏸️ **Pausa iniciada.** Vai tomar um cafézinho!")
      }

      if (customId === "retomar") {
        if (!p.pausado) return interaction.editReply("⚠️ Você não está em pausa.")
        p.pausado = false; p.pausas += agora - p.pausaInicio
        salvar(); atualizarPainelAdmin(guild)
        return interaction.editReply("▶️ **Pausa finalizada.** De volta ao trabalho!")
      }

      if (customId === "finalizar") {
        if (!p.ativo) return interaction.editReply("⚠️ Você precisa iniciar o ponto primeiro.")
        
        let tempo = agora - p.inicio - p.pausas
        p.total += tempo

        // Formatação nativa de data e hora do Discord para as Logs!
        const inicioDiscord = `<t:${Math.floor(p.inicio / 1000)}:F>`
        const fimDiscord = `<t:${Math.floor(agora / 1000)}:F>`

        const embedLog = new EmbedBuilder()
          .setTitle("📋 | REGISTRO DE EXPEDIENTE")
          .setColor("#2ECC71")
          .setThumbnail(user.displayAvatarURL({ dynamic: true })) // Pega a foto do membro!
          .addFields(
            { name: "👤 Mecânico", value: `<@${user.id}> (${p.nome})`, inline: false },
            { name: "🟢 Início do Turno", value: inicioDiscord, inline: true },
            { name: "🔴 Fim do Turno", value: fimDiscord, inline: true },
            { name: "⏱️ Tempo Trabalhado Agora", value: `\`${formatarTempo(tempo)}\``, inline: false },
            { name: "📈 Total Acumulado no Rank", value: `\`${formatarTempo(p.total)}\``, inline: false }
          )
          .setFooter({ text: "Sistema Integrado", iconURL: guild.iconURL() })
          .setTimestamp()

        const canalLogs = await client.channels.fetch(CANAL_LOGS)
        canalLogs.send({ embeds: [embedLog] })

        p.ativo = false; p.inicio = null; p.pausado = false; p.pausas = 0
        salvar(); atualizarRanking(guild); atualizarPainelAdmin(guild)
        return interaction.editReply("🔴 **Ponto finalizado com sucesso!** O registro foi enviado para as logs.")
      }
    }
  }
})

client.login(TOKEN)