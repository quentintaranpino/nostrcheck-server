const initMonthChart = (chartId, title, data) => {
  const rawData = JSON.parse(data);
  const monthCountsCurrentYear = new Array(12).fill(0);
  const monthCountsLastYear = new Array(12).fill(0);
  rawData.forEach(item => {
    const date = new Date(item.date.toString().substring(0,10));
    if (date.getUTCFullYear() == new Date().getFullYear()) {
      const month = date.getUTCMonth(); 
      monthCountsCurrentYear[month]++; 
    }
    if (date.getUTCFullYear() == new Date().getFullYear()-1) {
      const month = date.getUTCMonth(); 
      monthCountsLastYear[month]++; 
    }
  });
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov','Dec']
  new Chart($(chartId), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: new Date().getFullYear(), 
        data: monthCountsCurrentYear,
        borderColor: '#A575FF',
        backgroundColor: '#A575FF',
        cubicInterpolationMode: 'monotone',
        tension: 0.4,
        borderWidth: 3
      }, {
        label: new Date().getFullYear()-1,
        data: monthCountsLastYear,
        borderColor: '#8E9396',
        backgroundColor: '#9CA2A7',
        cubicInterpolationMode: 'monotone',
        tension: 0.4,
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
            display: true,
            text: title + ' (Last 2 Years)'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
};