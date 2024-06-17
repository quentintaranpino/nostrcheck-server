const initMonthChart = (chartId, title, rawData) => {
  console.log("initMonthChart", chartId, title, rawData);

  // Verificar que rawData y rawData.data están definidos
  if (!rawData || !Array.isArray(rawData.data)) {
    console.error("Invalid rawData format", rawData);
    return;
  }

  // Acceder al array dentro de rawData
  const dataArray = rawData.data;

  // Inicializar contadores para los meses del año actual y del año pasado
  const monthCountsCurrentYear = new Array(12).fill(0);
  const monthCountsLastYear = new Array(12).fill(0);
  
  // Obtener el año actual
  const currentYear = new Date().getFullYear();
  
  // Procesar cada elemento en dataArray
  dataArray.forEach(item => {
    const [count, dateStr] = item.split(',');
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(5)) - 1; // Los meses en JavaScript van de 0 a 11
  
    if (year === currentYear) {
      monthCountsCurrentYear[month] += parseInt(count);
    } else if (year === currentYear - 1) {
      monthCountsLastYear[month] += parseInt(count);
    }
  });

  // Etiquetas para los meses
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Crear el gráfico
  new Chart($(chartId), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: currentYear,
        data: monthCountsCurrentYear,
        borderColor: '#A575FF',
        backgroundColor: 'rgba(165, 117, 255, 0.7)',
        borderWidth: 2,
        hoverBackgroundColor: '#A575FF',
        hoverBorderColor: '#8E57E6',
        hoverBorderWidth: 3
      }, {
        label: currentYear - 1,
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

let doughnutCharts = {};

function initDoughnutChart(dashcardId, title, data, field, showTitle = false, showLegend = false, externalTooltip = false) {
  
  const values = [data.field, data.total - data.field];
  const labels = [field, 'un' + field];

  if (!dashcardId.toString().startsWith('#')) {
    dashcardId = '#' + dashcardId;
  }
  let chartId = dashcardId + '-doughnut-chart';

  if (doughnutCharts[chartId]) {
    doughnutCharts[chartId].data.labels = labels;
    doughnutCharts[chartId].data.datasets[0].data = values;
    doughnutCharts[chartId].update();
} else {

  const ctx = document.querySelector(chartId).getContext('2d');
  doughnutCharts[chartId] = new Chart(ctx, {
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
          maintainAspectRatio: false,
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
              tooltip: {
                enabled: externalTooltip? false : true,
                external: externalTooltip? function(context) {
                    // Tooltip Element
                    const tooltipEl = $(dashcardId + '-tooltip-text')[0];
                    console.log(dashcardId + '-tooltip-text')

                    // Hide if no tooltip
                    if (context.tooltip.opacity === 0) {
                      tooltipEl.classList.remove('visible');
                      return;
                    }

                   // Set Text
                   if (context.tooltip.body) {
                    const bodyLines = context.tooltip.body.map(b => b.lines);
                    const titleLines = context.tooltip.title || [];
                    let innerHtml = '';

                    titleLines.forEach(function(title) {
                      innerHtml += '<div>' + '<b>' + title + '</b>  : '
                      bodyLines.forEach((body, i) => {
                        innerHtml += body + '</div>';
                      });
                    });
    
                    tooltipEl.innerHTML = innerHtml;
                    tooltipEl.classList.add('visible');
                }
                }: null,
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
}
