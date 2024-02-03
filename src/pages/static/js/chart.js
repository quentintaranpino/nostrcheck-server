const initMonthChart = (chartId, label, data) => {
  const rawData = JSON.parse(data);
  const monthCounts = new Array(12).fill(0);
  rawData.forEach(item => {
    const date = new Date(item.date.toString().substring(0,10));
    console.debug('Date:', item.date.toString().substring(0,10));
    const month = date.getUTCMonth(); 
    monthCounts[month]++; 
  });
  const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11','12']
  new Chart($(chartId), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: label, 
        data: monthCounts,
        borderColor: '#8E9396',
        backgroundColor: '#9CA2A7',
        cubicInterpolationMode: 'monotone',
        tension: 0.4,
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
};