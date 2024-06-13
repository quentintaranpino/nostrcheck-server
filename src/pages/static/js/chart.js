const initMonthChart = (chartId, title, data) => {
  const rawData = JSON.parse(data);
  const monthCountsCurrentYear = new Array(12).fill(0);
  const monthCountsLastYear = new Array(12).fill(0);
  rawData.forEach(item => {
    const date = new Date(item.date? item.date.toString().substring(0,10) : item.createddate.toString().substring(0,10));
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


function initDoughnutChart(chartId, title, data, field, showTitle = false, showLegend = false) {
  
  const parsedData = JSON.parse(data);
  const values = [parsedData[0], parsedData[1]];
  const labels = [field, 'un' + field];

  const ctx = document.querySelector(chartId).getContext('2d');
  new Chart(ctx, {
      type: 'doughnut',
      data: {
          labels: labels,
          datasets: [{
              data: values,
              backgroundColor: [
                'rgba(255, 159, 64, 0.6)', 
                'rgba(186, 85, 211, 0.6)'  
            ],
            borderColor: [
                'rgba(255, 159, 64, 1)',  
                'rgba(186, 85, 211, 1)'  
            ],
              borderWidth: 1
          }]
      },
      options: {
          responsive: true,
          plugins: {
              title: {
                  display: showTitle,
                  text: title,
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
                  display: showLegend,
                  labels: {
                      font: {
                          size: 12,
                          family: 'Arial'
                      },
                      color: '#333'
                  }
              }
          }
      }
  });
}
