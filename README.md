
# plapser

Итак. Эта невиданная хуйня сделана ради хихи хаха и ничего больше я не принимаю

а вообще эта штука сделана чтобы я получал красивый календарик на неделю у себя в телефоне, парсингом вглтушного api  
я хз что они там курили и почему отдавать html таблицу с разметкой было выходом ~~в окно~~, но я сделяльб

## как поставить срань

Вам нужень vps или любой другой сервер на любой другой платформе и ОС которая может в node.JS 

я люблю n поэтому -> ```(sudo) apt install curl git make -y && (sudo) curl -L <https://bit.ly/n-install> | bash -s -- -y  ```
терь мой высер  
качаем - git clone <https://github.com/Ximerixx/plapser.git>  
ставим штуки - npm install  
прокидываем 3000 порт (ну или если вы его поменяли в server.js, то кидайте свой какой хотите)  
у меня все за реверс-прокси - я делаю прокси хосьт в NGINX  
запускаем - node server.js

## как пользоваться сранью

пример - <http://api.durka.su/gen?date=2025-04-21&group=%D0%98%D0%A12-244-%D0%9E%D0%91&type=json&tomorrow=true&subgroup=1>

Если хотите сгенерировать свою ссылку, теперь есть gui - <https://api.durka.su/gui>

хуйня понимает  
**date**, от начала которой начнется расписание в формате YYYY-MM-DD (если не указано, по идее сегодняшнюю должен взять)  
группа расписание которой он отдаст  
(формат, ваще хз какой, узнавайте у декана бля) у меня примерами были ИС2-244-ОБ ИС2-241-ОБ ИМ2-242-ОБ  
**type**, в котором вам вернется ответ, может принять три значения, 

json (голый от парсера)  
ics (выпускается с данными только за день с указанной датой)   
ics-week (отдает файл календаря на неделю от даты указаной выше)

флаг **tomorrow** - всегда берет завтрашний день, отсчитывая от того какой сейчас на сервере, вне зависимости от даты! **при этом дата игнорируется!**

**subgroup**... бля я ебал.  
не указано - отдаст все занятия у группы, без фильтрации  
1 или '1' - отдаст общие занятия (где номер п.г. ну не указан) и все что с первой подгруппой  
2 - ну бля сами подумайте  
  
**обязательными флагами считаются группа и date // tomorrow**
