const express = require("express");
const ical = require("ical-generator").default;
const { parseStudent } = require("./parser/parseStudent");
const fs = require('fs');

const path = require('path');
const { parseTeacher } = require("./parser/parseTeacher");

const app = express();
const port = 3000;
const TIMEZONE = "Europe/Moscow";

// Logging utility
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.ip ||
           'unknown';
}

function parseUserAgent(userAgent) {
    if (!userAgent) return { device: 'unknown', browser: 'unknown', os: 'unknown' };
    
    const ua = userAgent.toLowerCase();
    let device = 'desktop';
    let browser = 'unknown';
    let os = 'unknown';
    
    // Device detection
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
        device = 'mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
        device = 'tablet';
    }
    
    // Browser detection
    if (ua.includes('chrome') && !ua.includes('edg')) browser = 'chrome';
    else if (ua.includes('firefox')) browser = 'firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'safari';
    else if (ua.includes('edg')) browser = 'edge';
    else if (ua.includes('opera') || ua.includes('opr')) browser = 'opera';
    
    // OS detection
    if (ua.includes('windows')) os = 'windows';
    else if (ua.includes('mac os') || ua.includes('macos')) os = 'macos';
    else if (ua.includes('linux')) os = 'linux';
    else if (ua.includes('android')) os = 'android';
    else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'ios';
    
    return { device, browser, os };
}

function logRequest(req, res, responseTime, statusCode, resultSize = null) {
    const timestamp = new Date().toISOString();
    const clientIP = getClientIP(req);
    const method = req.method;
    const path = req.path;
    const query = JSON.stringify(req.query);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const referer = req.headers['referer'] || 'direct';
    const uaInfo = parseUserAgent(userAgent);
    
    const logData = {
        timestamp,
        ip: clientIP,
        method,
        path,
        query,
        statusCode,
        responseTime: `${responseTime}ms`,
        userAgent,
        device: uaInfo.device,
        browser: uaInfo.browser,
        os: uaInfo.os,
        referer,
        resultSize: resultSize ? `${resultSize} bytes` : null
    };
    
    console.log(JSON.stringify(logData));
}

// Request logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        const resultSize = res.get('content-length');
        logRequest(req, res, responseTime, res.statusCode, resultSize);
    });
    
    next();
});

const allowedTypes = new Set(["json", "json-week", "ics", "ics-week"]);

const modernCalFormat = true;

// Configuration for Nextcloud plugin serving
const serveNextcloudPlugin = false //false
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
            if (type === "json-week") {
                // Один запрос для всей недели - возвращаем все дни, что пришли от API
                const cacheKey = getScheduleCacheKey('student', group, baseDate, subgroup);
                let cacheInfo = getCachedSchedule(cacheKey);
                let fullData = null;
                
                if (!cacheInfo) {
                    fullData = await parseStudent(baseDate, group, subgroup);
                    if (fullData) {
                        setCachedSchedule(cacheKey, fullData);
                    }
                    setCacheHeaders(res, null);
                } else {
                    fullData = cacheInfo.data;
                    setCacheHeaders(res, cacheInfo);
                }
                
                return res.json(fullData || {});
            } else {
                // Один день - как раньше
                const cacheKey = getScheduleCacheKey('student', group, baseDate, subgroup);
                let cacheInfo = getCachedSchedule(cacheKey);
                let fullData = null;
                
                if (!cacheInfo) {
                    fullData = await parseStudent(baseDate, group, subgroup);
                    if (fullData) {
                        setCachedSchedule(cacheKey, fullData);
                    }
                    setCacheHeaders(res, null);
                } else {
                    fullData = cacheInfo.data;
                    setCacheHeaders(res, cacheInfo);
                }
                
                const result = {};
                if (fullData && fullData[baseDate]) {
                    result[baseDate] = fullData[baseDate];
                }
                return res.json(result);
            }
        }

        //если не json то нам сюда
        //rem - надо бы если честно оформлять это в if (ics) или типа того, но у меня была проверка до этого...
        const calendar = ical({
            name: `Расписание для ${group}`,
            timezone: TIMEZONE
        });

        if (type === "ics-week") {
            // Один запрос для всей недели - обрабатываем все дни, что пришли от API
            const cacheKey = getScheduleCacheKey('student', group, baseDate, subgroup);
            let cacheInfo = getCachedSchedule(cacheKey);
            let fullData = null;
            
            if (!cacheInfo) {
                fullData = await parseStudent(baseDate, group, subgroup);
                if (fullData) {
                    setCachedSchedule(cacheKey, fullData);
                }
                setCacheHeaders(res, null);
            } else {
                fullData = cacheInfo.data;
                setCacheHeaders(res, cacheInfo);
            }
            
            // Обрабатываем все дни из ответа
            if (fullData) {
                for (const day in fullData) {
                    const lessons = (fullData[day]?.lessons || []).filter(l => l.time && l.time.includes("-"));

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
            }
        } else {
            // Один день - как раньше
            const cacheKey = getScheduleCacheKey('student', group, baseDate, subgroup);
            let cacheInfo = getCachedSchedule(cacheKey);
            let fullData = null;
            
            if (!cacheInfo) {
                fullData = await parseStudent(baseDate, group, subgroup);
                if (fullData) {
                    setCachedSchedule(cacheKey, fullData);
                }
                setCacheHeaders(res, null);
            } else {
                fullData = cacheInfo.data;
                setCacheHeaders(res, cacheInfo);
            }
            
            const lessons = (fullData?.[baseDate]?.lessons || []).filter(l => l.time && l.time.includes("-"));

            for (const lesson of lessons) {
                const [startTime, endTime] = lesson.time.split("-");
                const [hourStart, minStart] = startTime.split(":").map(Number);
                const [hourEnd, minEnd] = endTime.split(":").map(Number);
                const [year, month, dayNum] = baseDate.split("-").map(Number);

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
            if (type === "json-week") {
                // Один запрос для всей недели - возвращаем все дни, что пришли от API
                const cacheKey = getScheduleCacheKey('teacher', teacher, baseDate);
                let cacheInfo = getCachedSchedule(cacheKey);
                let fullData = null;
                
                if (!cacheInfo) {
                    fullData = await parseTeacher(baseDate, teacher);
                    if (fullData) {
                        setCachedSchedule(cacheKey, fullData);
                    }
                    setCacheHeaders(res, null);
                } else {
                    fullData = cacheInfo.data;
                    setCacheHeaders(res, cacheInfo);
                }
                
                return res.json(fullData || {});
            } else {
                // Один день - как раньше
                const cacheKey = getScheduleCacheKey('teacher', teacher, baseDate);
                let cacheInfo = getCachedSchedule(cacheKey);
                let fullData = null;
                
                if (!cacheInfo) {
                    fullData = await parseTeacher(baseDate, teacher);
                    if (fullData) {
                        setCachedSchedule(cacheKey, fullData);
                    }
                    setCacheHeaders(res, null);
                } else {
                    fullData = cacheInfo.data;
                    setCacheHeaders(res, cacheInfo);
                }
                
                const result = {};
                if (fullData && fullData[baseDate]) {
                    result[baseDate] = fullData[baseDate];
                }
                return res.json(result);
            }
        }

        // если не json и не json-week -> генерим ICS
        const calendar = ical({
            name: `Расписание для ${teacher}`,
            timezone: TIMEZONE
        });

        if (type === "ics-week") {
            // Один запрос для всей недели - обрабатываем все дни, что пришли от API
            const cacheKey = getScheduleCacheKey('teacher', teacher, baseDate);
            let cacheInfo = getCachedSchedule(cacheKey);
            let fullData = null;
            
            if (!cacheInfo) {
                fullData = await parseTeacher(baseDate, teacher);
                if (fullData) {
                    setCachedSchedule(cacheKey, fullData);
                }
                setCacheHeaders(res, null);
            } else {
                fullData = cacheInfo.data;
                setCacheHeaders(res, cacheInfo);
            }
            
            // Обрабатываем все дни из ответа
            if (fullData) {
                for (const day in fullData) {
                    const lessons = (fullData[day]?.lessons || []).filter(l => l.time && l.time.includes("-"));

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
            }
        } else {
            // Один день - как раньше
            const cacheKey = getScheduleCacheKey('teacher', teacher, baseDate);
            let cacheInfo = getCachedSchedule(cacheKey);
            let fullData = null;
            
            if (!cacheInfo) {
                fullData = await parseTeacher(baseDate, teacher);
                if (fullData) {
                    setCachedSchedule(cacheKey, fullData);
                }
                setCacheHeaders(res, null);
            } else {
                fullData = cacheInfo.data;
                setCacheHeaders(res, cacheInfo);
            }
            
            const lessons = (fullData?.[baseDate]?.lessons || []).filter(l => l.time && l.time.includes("-"));

            for (const lesson of lessons) {
                const [startTime, endTime] = lesson.time.split("-");
                const [hourStart, minStart] = startTime.split(":").map(Number);
                const [hourEnd, minEnd] = endTime.split(":").map(Number);
                const [year, month, dayNum] = baseDate.split("-").map(Number);

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
const SCHEDULE_CACHE_TTL = 7200000; // 2 часа для расписаний
let groupsCache = {
    data: [],
    lastUpdated: 0
};
let teachersCache = {
    data: [],
    lastUpdated: 0
};

// Кэш расписаний: ключ = "student:group:date:subgroup" или "teacher:name:date"
let scheduleCache = new Map();

// Функции для работы с кэшем расписаний
function getScheduleCacheKey(type, entity, date, subgroup = null) {
    if (type === 'student') {
        return `student:${entity}:${date}:${subgroup || 'all'}`;
    } else {
        return `teacher:${entity}:${date}`;
    }
}

function getCachedSchedule(key) {
    const cached = scheduleCache.get(key);
    if (cached && (Date.now() - cached.timestamp < SCHEDULE_CACHE_TTL)) {
        const age = Date.now() - cached.timestamp;
        const ttl = SCHEDULE_CACHE_TTL - age;
        return {
            data: cached.data,
            cacheHit: true,
            cacheAge: age,
            cacheTTL: ttl
        };
    }
    if (cached) {
        scheduleCache.delete(key);
    }
    return null;
}

function setCacheHeaders(res, cacheInfo) {
    if (cacheInfo && cacheInfo.cacheHit) {
        res.setHeader('X-Cache-Hit', 'true');
        res.setHeader('X-Cache-Age', Math.floor(cacheInfo.cacheAge / 1000)); // seconds
        res.setHeader('X-Cache-TTL', Math.floor(cacheInfo.cacheTTL / 1000)); // seconds
    } else {
        res.setHeader('X-Cache-Hit', 'false');
    }
}

function setCachedSchedule(key, data) {
    scheduleCache.set(key, {
        data: data,
        timestamp: Date.now()
    });
    // Очистка старых записей (если кэш больше 1000 записей)
    if (scheduleCache.size > 1000) {
        const now = Date.now();
        for (const [k, v] of scheduleCache.entries()) {
            if (now - v.timestamp > SCHEDULE_CACHE_TTL) {
                scheduleCache.delete(k);
            }
        }
    }
}



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

    // Serve the installation script
    app.get('/next_plugin/install.sh', (req, res) => {
        const installScriptPath = path.join(__dirname, 'install.sh');

        // Check if install script exists
        if (!fs.existsSync(installScriptPath)) {
            console.error(`Install script not found at: ${installScriptPath}`);
            return res.status(404).json({
                error: 'Install script not found',
                message: 'The installation script is not available.',
                path: installScriptPath
            });
        }

        try {
            // Set appropriate headers for shell script download
            res.setHeader('Content-Type', 'application/x-sh');
            res.setHeader('Content-Disposition', 'attachment; filename="install"');
            res.setHeader('Content-Length', fs.statSync(installScriptPath).size);

            // Stream the file
            const fileStream = fs.createReadStream(installScriptPath);
            fileStream.pipe(res);

            console.log(`Served install script to ${req.ip}`);
        } catch (error) {
            console.error('Error serving install script:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to serve install script'
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
        console.log(`Installation script available at: http://localhost:${port}/next_plugin/install.sh`);
    }
});
