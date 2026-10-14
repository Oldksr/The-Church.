const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const play = require('play-dl');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const queues = new Map();

client.once('ready', () => {
    console.log('sh8al el bot tamam');
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === 'play') {
        const query = args.join(' ');
        if (!query) return message.reply('اكتب اسم الاغنية او الرابط يطيب');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('ادخل روم صوتي اول عشان تشتغل الموسيقى');

        let serverQueue = queues.get(message.guild.id);

        try {
            let songInfo;
            if (play.yt_validate(query) === 'video') {
                const fetched = await play.video_info(query);
                songInfo = { title: fetched.video_details.title, url: fetched.video_details.url };
            } else {
                const searched = await play.search(query, { limit: 1 });
                if (!searched.length) return message.reply('ما حصلت شي بهذا الاسم');
                songInfo = { title: searched[0].title, url: searched[0].url };
            }

            if (!serverQueue) {
                const queueConstruct = {
                    textChannel: message.channel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    songs: [],
                    player: createAudioPlayer(),
                    loop: false,
                    twentyFourSeven: false
                };

                queues.set(message.guild.id, queueConstruct);
                queueConstruct.songs.push(songInfo);

                try {
                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: message.guild.id,
                        adapterCreator: message.guild.voiceAdapterCreator,
                    });
                    queueConstruct.connection = connection;
                    playSong(message.guild.id, queueConstruct.songs[0]);
                    message.reply('تم البدء بتشغيل الاغنية');
                } catch (err) {
                    queues.delete(message.guild.id);
                    return message.reply('صار خطأ وانا اخوك ما قدر يدخل الروم');
                }
            } else {
                serverQueue.songs.push(songInfo);
                return message.reply('تمت اضافة الاغنية لقائمة الانتظار');
            }
        } catch (error) {
            return message.reply('صار خطأ اثناء معالجة الطلب');
        }
    }

    else if (cmd === 'stop' || cmd === 'leave' || cmd === 'توقيف' || cmd === 'وقف') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue) return message.reply('اصلاً مافيه شي شغال عشان اوقفه');

        serverQueue.songs = [];
        serverQueue.player.stop();
        if (serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        queues.delete(message.guild.id);
        return message.reply('تم توقيف الموسيقى وطلع البوت من الروم');
    }

    else if (cmd === 'panel') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue) return message.reply('مافيه شي شغال حاليا');

        const embed = new EmbedBuilder()
            .setTitle('لوحة التحكم الصوتية')
            .setDescription(`الاغنية الحالية: ${serverQueue.songs[0]?.title || 'لا يوجد'}`)
            .setColor(0xe50914);

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pause').setLabel('ايقاف مؤقت').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('resume').setLabel('استئناف').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('skip').setLabel('تخطي').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('stop').setLabel('توقيف كامل').setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('loop').setLabel('تكرار').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('247').setLabel('وضع 24 ساعة').setStyle(ButtonStyle.Secondary)
        );

        const panel = await message.channel.send({ embeds: [embed], components: [row1, row2] });
        const collector = panel.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async i => {
            if (!i.member.voice.channel) return i.reply({ content: 'انت مو بنفس الروم', ephemeral: true });

            if (i.customId === 'pause') {
                serverQueue.player.pause();
                await i.reply({ content: 'تم ايقاف الاغنية مؤقتا', ephemeral: true });
            } else if (i.customId === 'resume') {
                serverQueue.player.unpause();
                await i.reply({ content: 'تم استئناف الاغنية', ephemeral: true });
            } else if (i.customId === 'skip') {
                serverQueue.player.stop();
                await i.reply({ content: 'تم تخطي الاغنية', ephemeral: true });
            } else if (i.customId === 'stop') {
                serverQueue.songs = [];
                serverQueue.player.stop();
                if (serverQueue.connection) serverQueue.connection.destroy();
                queues.delete(i.guild.id);
                await i.reply({ content: 'تم ايقاف المشغل وطلع البوت من الروم', ephemeral: true });
            } else if (i.customId === 'loop') {
                serverQueue.loop = !serverQueue.loop;
                await i.reply({ content: `وضع التكرار صار ${serverQueue.loop ? 'مفعل' : 'معطل'}`, ephemeral: true });
            } else if (i.customId === '247') {
                serverQueue.twentyFourSeven = !serverQueue.twentyFourSeven;
                await i.reply({ content: `وضع 24 ساعة صار ${serverQueue.twentyFourSeven ? 'مفعل' : 'معطل'}`, ephemeral: true });
            }
        });
    }
});

async function playSong(guildId, song) {
    const serverQueue = queues.get(guildId);
    if (!song) {
        if (!serverQueue.twentyFourSeven) {
            setTimeout(() => {
                if (serverQueue.songs.length === 0 && getVoiceConnection(guildId)) {
                    serverQueue.connection.destroy();
                    queues.delete(guildId);
                }
            }, 30000);
        }
        return;
    }

    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        serverQueue.player.play(resource);
        serverQueue.connection.subscribe(serverQueue.player);

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            if (!serverQueue.loop) serverQueue.songs.shift();
            playSong(guildId, serverQueue.songs[0]);
        });
    } catch (error) {
        serverQueue.songs.shift();
        playSong(guildId, serverQueue.songs[0]);
    }
}

client.login(process.env.TOKEN);
 
