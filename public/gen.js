document.addEventListener('DOMContentLoaded', function () {
    const modeToggle = document.getElementById('mode-toggle');
    const groupInput = document.getElementById('group');
    const groupList = document.getElementById('group-list');
    const subgroupInput = document.getElementById('subgroup');
    const subgroupContainer = subgroupInput.closest('.input-group');
    const dateInput = document.getElementById('date');
    const tomorrowCheckbox = document.getElementById('tomorrow');
    const generateButton = document.getElementById('generate');
    const generatedLink = document.getElementById('generated-link');
    const copyButton = document.getElementById('copy-button');
    const groupLabel = document.querySelector('.input-group label');

    const previewField = document.getElementById('preview');

    const clearButton = document.getElementById('clear-group');

    clearButton.addEventListener('click', function (e) {
        e.preventDefault();
        clearGroupInput();
    });

    function clearGroupInput() {
        groupInput.value = '';
        groupList.innerHTML = '';
    }

    let allOptions = [];

    const today = new Date();
    dateInput.valueAsDate = today;

    modeToggle.addEventListener('change', function () {
        if (this.checked) {
            groupLabel.textContent = 'Преподаватель';
            subgroupContainer.style.display = 'none';
            clearGroupInput();
            fetchTeachers();
        } else {
            groupLabel.textContent = 'Группа';
            subgroupContainer.style.display = '';
            clearGroupInput();
            fetchGroups();
        }
    });

    fetchGroups();

    generateButton.addEventListener('click', generateLink);
    copyButton.addEventListener('click', copyLink);

    tomorrowCheckbox.addEventListener('change', function () {
        dateInput.disabled = this.checked;
        if (this.checked) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            dateInput.valueAsDate = tomorrow;
        }
    });

    groupInput.addEventListener('input', updateDropdown);






    async function fetchGroups() {
        try {
            const response = await fetch('/api/groups');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            allOptions = await response.json();
            updateDropdown();
        } catch (error) {
            console.error('Ошибка загрузки групп:', error);
            alert('Не удалось загрузить список групп.');
        }
    }

    async function fetchTeachers() {
        try {
            const response = await fetch('/api/teachers');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            allOptions = await response.json();
            updateDropdown();
        } catch (error) {
            console.error('Ошибка загрузки преподавателей:', error);
            alert('Не удалось загрузить список преподавателей.');
        }
    }



    function updateDropdown() {
        const value = groupInput.value.toLowerCase();
        groupList.innerHTML = '';

        if (!value) return;

        const filtered = allOptions.filter(option =>
            option.toLowerCase().includes(value)
        ).slice(0, 10);

        filtered.forEach(option => {
            const li = document.createElement('li');
            li.textContent = option;
            li.classList.add('dropdown-item');
            li.addEventListener('click', () => {
                groupInput.value = option;
                groupList.innerHTML = '';
            });
            groupList.appendChild(li);
        });
    }

    function generateLink() {
        const isTeacherMode = modeToggle.checked;
        const entity = groupInput.value.trim();
        const type = document.querySelector('input[name="type"]:checked').value;
        const subgroup = subgroupInput.value;
        const date = dateInput.value;
        const tomorrow = tomorrowCheckbox.checked;

        if (!entity) {
            alert(`Пожалуйста, выберите ${isTeacherMode ? 'преподавателя' : 'группу'}`);
            return;
        }

        let url = isTeacherMode
            ? `https://api.durka.su/gen_teach?teacher=${encodeURIComponent(entity)}&type=${type}`
            : `https://api.durka.su/gen?group=${encodeURIComponent(entity)}&type=${type}`;

        if (!isTeacherMode && subgroup) {
            url += `&subgroup=${subgroup}`;
        }

        if (tomorrow) {
            url += '&tomorrow=true';
        } else if (date) {
            url += `&date=${date}`;
        }

        generatedLink.value = url;
    }

    function copyLink() {
        if (!generatedLink.value) {
            alert('Сначала сгенерируйте ссылку');
            return;
        }

        generatedLink.select();
        document.execCommand('copy');

        copyButton.classList.add('copied');
        setTimeout(() => copyButton.classList.remove('copied'), 1000);
    }
});
