const express = require("express");
const ical = require("ical-generator").default;
const { parseStudent } = require("./parser/parseStudent");
const fs = require('fs');

const path = require('path');
const { parseTeacher } = require("./parser/parseTeacher");

const app = express();
const port = 3000;
const TIMEZONE = "Europe/Moscow";

const allowedTypes = new Set(["json", "json-week", "ics", "ics-week"]);

const modernCalFormat = true;

// Configuration for Nextcloud plugin serving
const serveNextcloudPlugin = true //false
const nextcloudPluginPath = './next_plugin.tar.gz'


//офсетные дны, генекрат baseDate - опциональный

function getDateOffset(offsetDays = 0, baseDate = null) {
    const d = baseDate ? new Date(baseDate) : new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
}
const cors = require('cors');
app.use(cors({
    origin: 'https://durka.su', // or '*' for all origins
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.get("/gen", async (req, res) => {
    const { date, group, type: rawType, tomorrow, subgroup = null } = req.query;


    //проверка на существование "type " в запросе
    if (!group || !rawType) {
        return res.status(400).send("Need: group, type (+ date or tomorrow/ics-week)");
    }

    const type = rawType.toLowerCase();

    if (!allowedTypes.has(type)) {
        return res.status(400).send("Bad type. Allowed: json, json-week, ics, ics-week");
    }

    //танцы с датой
    let baseDate;
    if (tomorrow === "true") { //если в запросе просят завтра отдаем // YYYY-MM-DD // в парсер как baseDate
        baseDate = getDateOffset(1, baseDate);
    } else if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { //если регулярка не проверила - нам дали кривую дату
            return res.status(400).send("Bad date format. Use YYYY-MM-DD");
        }
        baseDate = date;
    } else {
        baseDate = getDateOffset(0); // ну, просто потому чтобы не падало, пусть лучше сегодня будет чем 500
    }

    try {
        if (type === "json" || type === "json-week") {
            const daysToGenerate = type === "json-week" ? 7 : 1;
            const result = {};
            // todo - паковать бля сразу все, а не дергать за хуй семь раз, но пока так
            for (let i = 0; i < daysToGenerate; i++) {
                const day = getDateOffset(i, baseDate);
                const fullData = await parseStudent(day, group);
                if (fullData && fullData[day]) {
                    result[day] = fullData[day];
                }
            }

            return res.json(result);
        }

        //если не json то нам сюда
        //rem - надо бы если честно оформлять это в if (ics) или типа того, но у меня была проверка до этого...
        const calendar = ical({
            name: `Расписание для ${group}`,
            timezone: TIMEZONE
        });

        const daysToGenerate = type === "ics-week" ? 7 : 1;

        for (let i = 0; i < daysToGenerate; i++) {
            const day = getDateOffset(i, baseDate);
            const fullData = await parseStudent(day, group, subgroup);
            const lessons = (fullData?.[day]?.lessons || []).filter(l => l.time && l.time.includes("-"));

            for (const lesson of lessons) {
                const [startTime, endTime] = lesson.time.split("-");
                const [hourStart, minStart] = startTime.split(":").map(Number);
                const [hourEnd, minEnd] = endTime.split(":").map(Number);
                const [year, month, dayNum] = day.split("-").map(Number);

                if (modernCalFormat) {
                    calendar.createEvent({
                        start: new Date(year, month - 1, dayNum, hourStart, minStart),
                        end: new Date(year, month - 1, dayNum, hourEnd, minEnd),
                        summary: lesson.name + (lesson.type ? ` (${lesson.type})` : "") + lesson.classroom,
                        description: `${lesson.teacher}${lesson.subgroup ? ` | П/г: ${lesson.subgroup}` : ""}`,
                        location: lesson.classroom,
                        timezone: TIMEZONE
                    });
                } else if (!modernCalFormat) {
                    calendar.createEvent({
                        start: new Date(year, month - 1, dayNum, hourStart, minStart),
                        end: new Date(year, month - 1, dayNum, hourEnd, minEnd),
                        summary: lesson.name + (lesson.type ? ` (${lesson.type})` : ""),
                        description: `${lesson.teacher}${lesson.subgroup ? ` | П/г: ${lesson.subgroup}` : ""}`,
                        location: lesson.classroom,
                        timezone: TIMEZONE
                    });
                }
            }
        }

        res.setHeader("Content-Type", "text/calendar");
        res.setHeader("Content-Disposition", `inline; filename=schedule${type === "ics-week" ? "-week" : ""}.ics`);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Published-TTL", "PT1H");

        res.send(calendar.toString());
    } catch (err) {
        console.error(err);
        res.status(500).send("damm 500, you must be hard on this, don't you?");
    }
});


app.get("/gen_teach", async (req, res) => {
    const { date, teacher, type: rawType, tomorrow } = req.query;

    if (!teacher || !rawType) {
        return res.status(400).send("Need: teacher, type (+ date or tomorrow/json-week/ics-week)");
    }

    const type = rawType.toLowerCase();

    if (!allowedTypes.has(type)) {
        return res.status(400).send("Bad type. Allowed: json, json-week, ics, ics-week");
    }

    let baseDate;

    if (tomorrow === "true") {
        baseDate = getDateOffset(1, baseDate);
    } else if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).send("Bad date format. Use YYYY-MM-DD");
        }
        baseDate = date;
    } else {
        baseDate = getDateOffset(0, baseDate); // сегодня
    }

    try {
        if (type === "json" || type === "json-week") {
            const daysToGenerate = type === "json-week" ? 7 : 1;
            const result = {};

            for (let i = 0; i < daysToGenerate; i++) {
                const day = getDateOffset(i, baseDate);
                const fullData = await parseTeacher(day, teacher);
                if (fullData && fullData[day]) {
                    result[day] = fullData[day];
                }
            }

            return res.json(result);
        }

        // если не json и не json-week -> генерим ICS
        const calendar = ical({
            name: `Расписание для ${teacher}`,
            timezone: TIMEZONE
        });

        const daysToGenerate = type === "ics-week" ? 7 : 1;

        for (let i = 0; i < daysToGenerate; i++) {
            const day = getDateOffset(i, baseDate);
            const fullData = await parseTeacher(day, teacher);
            const lessons = (fullData?.[day]?.lessons || []).filter(l => l.time && l.time.includes("-"));

            for (const lesson of lessons) {
                const [startTime, endTime] = lesson.time.split("-");
                const [hourStart, minStart] = startTime.split(":").map(Number);
                const [hourEnd, minEnd] = endTime.split(":").map(Number);
                const [year, month, dayNum] = day.split("-").map(Number);

                if (modernCalFormat) {
                    calendar.createEvent({
                        start: new Date(year, month - 1, dayNum, hourStart, minStart),
                        end: new Date(year, month - 1, dayNum, hourEnd, minEnd),
                        summary: lesson.subject || "Занятие",
                        description: `${lesson.room || ""} ${lesson.group || ""}${lesson.note ? ` | ${lesson.note}` : ""}`,
                        location: lesson.room || "",
                        timezone: TIMEZONE
                    });
                }
                else if (!modernCalFormat) {
                    calendar.createEvent({
                        start: new Date(year, month - 1, dayNum, hourStart, minStart),
                        end: new Date(year, month - 1, dayNum, hourEnd, minEnd),
                        summary: lesson.subject || "Занятие",
                        description: `${lesson.group || ""}${lesson.note ? ` | ${lesson.note}` : ""}`,
                        location: lesson.room || "",
                        timezone: TIMEZONE
                    });
                }
            }
        }

        res.setHeader("Content-Type", "text/calendar");
        res.setHeader("Content-Disposition", `inline; filename=schedule${type === "ics-week" ? "-week" : ""}.ics`);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Published-TTL", "PT1H");

        res.send(calendar.toString());
    } catch (err) {
        console.error(err);
        res.status(500).send("damm 500, you must be hard on this, don't you?");
    }
});














////////КЕШИРОВАНИЕ ДАННЫХ ПРЕПОДОВ И ГРУПП СТУДЕНТОВ

const CACHE_TTL = 3600000; // 1 час в миллисекундах
let groupsCache = {
    data: [],
    lastUpdated: 0
};
let teachersCache = {
    data: [],
    lastUpdated: 0
};



app.get('/api/groups', async (req, res) => {
    try {
        // Если кэш устарел, обновляем его
        if (Date.now() - groupsCache.lastUpdated > CACHE_TTL) {
            const response = await fetch('https://kis.vgltu.ru/list?type=Group');
            const groups = await response.json();

            groupsCache = {
                data: Array.isArray(groups) ? groups.filter(g => typeof g === 'string' && g.trim() !== '') : [],
                lastUpdated: Date.now()
            };
        }

        res.json(groupsCache.data);
    } catch (error) {
        console.error('Ошибка при получении групп:', error);
        res.status(500).json({ error: 'Не удалось получить список групп' });
    }
});

app.get('/api/teachers', async (req, res) => {
    try {
        // Если кэш устарел, обновляем его
        if (Date.now() - teachersCache.lastUpdated > CACHE_TTL) {
            const response = await fetch('https://kis.vgltu.ru/list?type=Teacher');
            const teachers = await response.json();

            teachersCache = {
                data: Array.isArray(teachers) ? teachers.filter(g => typeof g === 'string' && g.trim() !== '') : [],
                lastUpdated: Date.now()
            };
        }

        res.json(teachersCache.data);
    } catch (error) {
        console.error('Ошибка при получении групп:', error);
        res.status(500).json({ error: 'Не удалось получить список групп' });
    }
});



app.use(express.static(path.join(__dirname, 'public')));


// Роут для /gui
app.get('/gui', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'gui.html'));
});

// Search for teacher location today
app.get('/searchTeach', async (req, res) => {
    const { teacher } = req.query;

    if (!teacher) {
        return res.status(400).json({ error: 'Teacher parameter is required' });
    }

    try {
        const today = getDateOffset(0); // Get today's date
        const teacherSchedule = await parseTeacher(today, teacher);

        if (!teacherSchedule || !teacherSchedule[today]) {
            return res.json({
                teacher: teacher,
                date: today,
                message: 'No lessons found for today',
                lessons: []
            });
        }

        const lessons = teacherSchedule[today].lessons || [];
        const activeLessons = lessons.filter(lesson =>
            lesson.time &&
            lesson.time.includes('-') &&
            lesson.room &&
            lesson.group
        );

        // Format response for easy display
        const formattedLessons = activeLessons.map(lesson => ({
            time: lesson.time,
            subject: lesson.subject || 'Занятие',
            room: lesson.room,
            group: lesson.group,
            note: lesson.note || ''
        }));

        res.json({
            teacher: teacher,
            date: today,
            dayOfWeek: teacherSchedule[today].dayOfWeek,
            lessons: formattedLessons,
            totalLessons: formattedLessons.length
        });

    } catch (error) {
        console.error('Error searching for teacher:', error);
        res.status(500).json({
            error: 'Failed to search for teacher location',
            message: error.message
        });
    }
});

// Роут для поиска преподавателя
app.get('/searchTeacher', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'searchTeacher.html'));
});

// Роут для поиска расписания группы
app.get('/searchStudent', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'searchStudent.html'));
});

// Marketplace routes for Nextcloud plugin
if (serveNextcloudPlugin) {
    console.log(`Nextcloud plugin serving enabled. Plugin path: ${nextcloudPluginPath}`);

    // Serve the plugin package
    app.get('/next_plugin/next_plugin.tar.gz', (req, res) => {
        const pluginPath = nextcloudPluginPath;

        // Check if plugin package exists
        if (!fs.existsSync(pluginPath)) {
            console.error(`Plugin package not found at: ${pluginPath}`);
            return res.status(404).json({
                error: 'Plugin package not found',
                message: 'The Nextcloud plugin package is not available. Please check the configuration.',
                path: pluginPath
            });
        }

        try {
            // Set appropriate headers for file download
            res.setHeader('Content-Type', 'application/gzip');
            res.setHeader('Content-Disposition', 'attachment; filename="next_plugin.tar.gz"');
            res.setHeader('Content-Length', fs.statSync(pluginPath).size);

            // Stream the file
            const fileStream = fs.createReadStream(pluginPath);
            fileStream.pipe(res);

            console.log(`Served plugin package to ${req.ip}`);
        } catch (error) {
            console.error('Error serving plugin package:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to serve plugin package'
            });
        }
    });

} else {
    console.log('Nextcloud plugin serving disabled. Set SERVE_NEXTCLOUD_PLUGIN=true in server.js to enable.');
}

app.listen(port, () => {
    console.log(`server ok!`);
    if (serveNextcloudPlugin) {
        console.log(`Nextcloud plugin available at: http://localhost:${port}/next_plugin/next_plugin.tar.gz or wherever your plapser is hosted`);
    }
});
