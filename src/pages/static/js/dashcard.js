const initDashcard = async (dashcardId, dascardName, dashcardDataKey, icon, link, action, field) => {
    console.debug("initDashcard", dashcardId, dascardName, dashcardDataKey, icon, link, action)

    $('#' + dashcardId + '-name').text(dascardName)

    const iconElement = $('#' + dashcardId + '-icon');
    iconElement.removeClass(); 
    iconElement.addClass('fa-3x card-icon');

    if (icon === "chart") {
        iconElement.addClass('fas fa-chart-simple');
    } else if (icon === "warning") {
        iconElement.addClass('fas fa-exclamation-triangle text-warning');
    } else if (icon === "satoshi") {
        iconElement.addClass('fas fa-bolt-lightning text-warning');
    } else if (icon === "doughnut") {
        const iconContainer = $('#' + dashcardId + '-icon-container');
        iconContainer.append('<canvas style="border 1px solid black" id="' + dashcardId + '-doughnut-chart" width="50" height="50"></canvas>');
    }

    $('#' + dashcardId + '-reload-button').on('click', async function() {
        console.debug(`Reload button clicked for dashcard ${dashcardId}`);
        semaphore.execute(async() => await refreshDashcard(dashcardId, dashcardDataKey, action, field));
    });

    semaphore.execute(async () => await refreshDashcard(dashcardId, dashcardDataKey, action, field));
}

const refreshDashcard = async(dashcardId, dashcardDataKey, action, field) => {

    $('#' + dashcardId + '-tooltip-text').addClass('visible');
    $('#' + dashcardId + '-tooltip-text').text('Retrieving data...');
    console.debug("refresDashcard", dashcardId, dashcardDataKey, action, field)

    const totalCount = await fetchDashcardData(dashcardDataKey, action, "")
    $('#' + dashcardId + '-text').text(totalCount.total)
    if (field !== "" && field !== undefined) {
        console.log("FIELD", field)
        const fieldCount = await fetchDashcardData(dashcardDataKey, action, field)
        initDoughnutChart(dashcardId, dashcardDataKey, {field: fieldCount.total, total: totalCount.total}, field, false, false, true)
    }
    setTimeout(() => {
        $('#' + dashcardId + '-tooltip-text').removeClass('visible');
    }, 1000);
}

const fetchDashcardData = async (dashcardDataKey, action, field) => {
    console.debug("fetchDashcardData", dashcardDataKey, action)
    console.debug("Using authkey", localStorage.getItem('authkey'))

    let serverData  = ""

    await fetch(`admin/modulecountdata?module=${dashcardDataKey}&action=${action}&field=${field}`
        , {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authkey')}`,
            }}
        )
            .then(response => response.json())
            .then(data => {
                storeAuthkey(data.authkey)
                serverData = data;
            })
            .catch(error => console.error('Error:', error));

            return serverData || { total: 0 }

}

// Set the data for the dashcards
let dashcards =[
    { dashcardId: 'nostraddressCount',  dataKey: 'nostraddress', icon: 'doughnut', dashcardName: 'Registered users', link: '#nostraddressData', action: 'count', field: 'checked' },
    { dashcardId: 'mediaCount', dataKey: 'media', icon: 'doughnut', dashcardName: 'Media files', link: '#mediaData' , action: 'count', field: 'checked'},
    { dashcardId: 'lightningCount', dataKey: 'lightning', icon: 'chart', dashcardName: 'Lightning redirects', link: '#lightningData', action: 'count'},
    { dashcardId: 'domainsCount', dataKey: 'domains', icon: 'chart', dashcardName: 'Domains', link: '#domainsData', action: 'count'},
    { dashcardId: 'logHistory', dataKey: 'logger', icon: 'warning', dashcardName: 'Warning messages', link: 'settings/#settingsLogger', action: 'countWarning' },
    { dashcardId: 'paymentsCount', dataKey: 'payments', icon: 'doughnut', dashcardName: 'Transactions', link: '#paymentsData', action: 'count', field: 'paid'},
    { dashcardId: 'unpaidTransactionsBalance', dataKey: 'payments', icon: 'satoshi', dashcardName: 'Unpaid transactions balance', link: '#paymentsData', action: 'unpaidTransactions' },
    { dashcardId: 'serverBalance', dataKey: 'payments', icon: 'satoshi', dashcardName: 'Server balance', link: '', action: 'serverBalance' },
]

const refreshDashcards = async () => {
    console.debug("refreshDashcards")
    for (const dashcard of dashcards) {
        await refreshDashcard(dashcard.dashcardId, dashcard.dataKey,  dashcard.action, dashcard.field)
    }
}