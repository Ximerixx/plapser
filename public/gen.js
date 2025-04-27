document.addEventListener('DOMContentLoaded', function() {
    const groupSelect = document.getElementById('group');
    const subgroupInput = document.getElementById('subgroup');
    const dateInput = document.getElementById('date');
    const tomorrowCheckbox = document.getElementById('tomorrow');
    const generateButton = document.getElementById('generate');
    const generatedLink = document.getElementById('generated-link');
    const copyButton = document.getElementById('copy-button');

    // Установка даты
    const today = new Date();
    dateInput.valueAsDate = today;

    // Загрузка групп
    fetchGroups();

    generateButton.addEventListener('click', generateLink);
    copyButton.addEventListener('click', copyLink);

    tomorrowCheckbox.addEventListener('change', function() {
        dateInput.disabled = this.checked;
        if (this.checked) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            dateInput.valueAsDate = tomorrow;
        }
    });

    async function fetchGroups() {
        try {
            const response = await fetch('/api/groups');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const groups = await response.json();

            groupSelect.innerHTML = '';
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Выберите группу';
            defaultOption.disabled = true;
            defaultOption.selected = true;
            groupSelect.appendChild(defaultOption);

            [...groups].sort((a, b) => a.localeCompare(b)).forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                option.textContent = group;
                groupSelect.appendChild(option);
            });

            groupSelect.disabled = false;
        } catch (error) {
            console.error('Ошибка загрузки групп:', error);
            alert('Не удалось загрузить список групп. Пожалуйста, попробуйте позже.');
        }
    }

    function generateLink() {
        const group = groupSelect.value;
        const type = document.querySelector('input[name="type"]:checked').value;
        const subgroup = subgroupInput.value;
        const date = dateInput.value;
        const tomorrow = tomorrowCheckbox.checked;

        if (!group) {
            alert('Пожалуйста, выберите группу');
            return;
        }

        let url = `https://api.durka.su/gen?group=${encodeURIComponent(group)}&type=${type}`;
        if (subgroup) url += `&subgroup=${subgroup}`;
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

document.addEventListener('DOMContentLoaded', () => {
    const helpButtons = document.querySelectorAll('.help-button');

    helpButtons.forEach(button => {
        const tooltip = button.nextElementSibling;

        button.addEventListener('click', (e) => {
            e.preventDefault();
            // Закрываем все тултипы сначала
            document.querySelectorAll('.help-tooltip').forEach(tip => {
                if (tip !== tooltip) tip.style.display = 'none';
            });
            tooltip.style.display = tooltip.style.display === 'block' ? 'none' : 'block';
        });

        // Клик вне тултипа закрывает его
        document.addEventListener('click', (e) => {
            if (!button.contains(e.target) && !tooltip.contains(e.target)) {
                tooltip.style.display = 'none';
            }
        });
    });
});

