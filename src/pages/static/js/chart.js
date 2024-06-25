const initMonthChart = (chartId, title, rawData) => {
  console.log("initMonthChart", chartId, title, rawData);

  if (!rawData || !Array.isArray(rawData.data)) {
    console.error("Invalid rawData format", rawData);
    return;
  }

  const dataArray = rawData.data;

  const monthCountsCurrentYear = new Array(12).fill(0);
  const monthCountsLastYear = new Array(12).fill(0);
  
  const currentYear = new Date().getFullYear();
  
  dataArray.forEach(item => {
    const [count, dateStr] = item.split(',');
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(5)) - 1; 
  
    if (year === currentYear) {
      monthCountsCurrentYear[month] += parseInt(count);
    } else if (year === currentYear - 1) {
      monthCountsLastYear[month] += parseInt(count);
    }
  });

  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const chart = new Chart($(chartId), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: currentYear,
        data: monthCountsCurrentYear,
        backgroundColor: 'rgba(165, 117, 255, 0.7)',
        borderRadius: 5,
        hoverBackgroundColor: '#A575FF',
      }, {
        label: currentYear - 1,
        data: monthCountsLastYear,
        backgroundColor: 'rgba(156, 162, 167, 0.7)',
        borderRadius: 5,
        hoverBackgroundColor: '#8E9396',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      plugins: {
        title: {
          display: true,
          text: `${title} (${currentYear} vs ${currentYear - 1})`,
          font: {
            family: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
            size: 20,
            weight: 'bold',

          },
          color: localStorage.getItem('theme') === 'dark' ? '#FFFFFF' : '#4d4c4c',
          padding: {
            top: 10,
            bottom: 30
          }
        },
        legend: {
          labels: {
            font: {
              family: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
              size: 12,
            },
            color: localStorage.getItem('theme') === 'dark' ? '#FFFFFF' : '#4d4c4c'
          }
        }
      },
      scales: {
        x: {
          ticks: {
            font: {
              size: 12,
              family: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
            },
            color: localStorage.getItem('theme') === 'dark' ? '#FFFFFF' : '#4d4c4c'
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
              family: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
            },
            color: localStorage.getItem('theme') === 'dark' ? '#FFFFFF' : '#4d4c4c'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
      }
    }
  });

  document.querySelector(chartId).style.height = '400px';
  document.getElementById('theme-switch').addEventListener('click', () => {

    if ( document.getElementById('theme-switch').checked === true ) {
      chart.options.plugins.title.color = '#FFFFFF';
      chart.options.plugins.legend.labels.color = '#FFFFFF';
      chart.options.scales.x.ticks.color = '#FFFFFF';
      chart.options.scales.y.ticks.color = '#FFFFFF';
    } else{
      chart.options.plugins.title.color = '#4d4c4c';
      chart.options.plugins.legend.labels.color = '#4d4c4c';
      chart.options.scales.x.ticks.color = '#4d4c4c';
      chart.options.scales.y.ticks.color = '#4d4c4c';
    }
    chart.update();
  });

  $(window).resize(function() {
    chart.resize(document.querySelector(chartId).parentElement.getBoundingClientRect().width, '400px');
    chart.update();
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
              borderWidth: 0
          }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        resizeDelay: 200,
          plugins: {
              title: {
                  display: showTitle,
                  text: title,
                  font: {
                      size: 20,
                      family: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
                      weight: 'bold'
                  },
                  color: localStorage.getItem('theme') === 'dark' ? '#FFFFFF' : '#4d4c4c',
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

                          family: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
                      },
                      color: localStorage.getItem('theme') === 'dark' ? '#FFFFFF' : '#4d4c4c',
                      boxHeight: 20,
                      position: 'bottom'
                  }
              }
          }
      }
  
    });

  document.getElementById('theme-switch').addEventListener('click', () => {

    Object.values(doughnutCharts).forEach(chart => {
      if (document.getElementById('theme-switch').checked === true) {
        chart.options.plugins.title.color = '#FFFFFF';
        chart.options.plugins.legend.labels.color = '#FFFFFF';
      } else {
        chart.options.plugins.title.color = 'var(--bs-secondary)';
        chart.options.plugins.legend.labels.color = '#4d4c4c';
      }
      chart.update();
    });

  });

  $(window).resize(function() {
    doughnutCharts[chartId].resize(document.querySelector(chartId).parentElement.getBoundingClientRect().width - 10, '400px');
    doughnutCharts[chartId].update();
  });

}};

