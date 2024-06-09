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

  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  new Chart($(chartId), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: new Date().getFullYear(), 
        data: monthCountsCurrentYear,
        borderColor: '#A575FF',
        backgroundColor: 'rgba(165, 117, 255, 0.7)',
        borderWidth: 2,
        hoverBackgroundColor: '#A575FF',
        hoverBorderColor: '#8E57E6',
        hoverBorderWidth: 3
      }, {
        label: new Date().getFullYear() - 1,
        data: monthCountsLastYear,
        borderColor: '#8E9396',
        backgroundColor: 'rgba(156, 162, 167, 0.7)',
        borderWidth: 2,
        hoverBackgroundColor: '#8E9396',
        hoverBorderColor: '#767B7F',
        hoverBorderWidth: 3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `${title} (Last 2 Years)`,
          font: {
            size: 22,
            family: 'Arial',
            weight: 'bold'
          },
          color: '#333',
          padding: {
            top: 10,
            bottom: 30
          }
        },
        legend: {
          labels: {
            font: {
              size: 14,
              family: 'Arial'
            },
            color: '#333'
          }
        }
      },
      scales: {
        x: {
          ticks: {
            font: {
              size: 12,
              family: 'Arial'
            },
            color: '#333'
          },
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: {
              size: 12,
              family: 'Arial'
            },
            color: '#333'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
      }
    }
  });
};
