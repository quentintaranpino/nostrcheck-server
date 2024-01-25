 const createRow =  (obj) => {
   const row = document.createElement("tr");
   const objKeys = Object.keys(obj);
   objKeys.map((key) => {
     const cell = document.createElement("td");
     cell.setAttribute("data-attr", key);
     cell.innerHTML = obj[key];
     row.appendChild(cell);
   });
   return row;
 };
 
 const getTableContent = (tbody, data) => {
   data.map( (obj) => {
     const row =  createRow(obj);
     document.getElementById(tbody).appendChild(row);
   });

 };
 
 function sortTable(tablename, columnOrder) {
  var table, rows, switching, i, x, y, shouldSwitch, dir, switchcount = 0;
  table = tablename
  //remove all data-dir attributes
  const cols = table.querySelectorAll('th');
  cols.forEach(col => document.getElementById(col.id + '-btn').removeAttribute('data-dir'));
  
  switching = true;
  dir = "asc"; 
  /*Make a loop that will continue until
  no switching has been done:*/
  while (switching) {
    //start by saying: no switching is done:
    switching = false;
    rows = table.rows;
    /*Loop through all table rows (except the
    first, which contains table headers):*/
    for (i = 1; i < (rows.length - 1); i++) {
      //start by saying there should be no switching:
      shouldSwitch = false;
      /*Get the two elements you want to compare,
      one from current row and one from the next:*/
      x = rows[i].getElementsByTagName("TD")[columnOrder];
      y = rows[i + 1].getElementsByTagName("TD")[columnOrder];
      /*check if the two rows should switch place,
      based on the direction, asc or desc:*/
      if (dir == "asc") {
        if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
          document.getElementById(cols[columnOrder].id + '-btn').setAttribute("data-dir", "asc");
          //if so, mark as a switch and break the loop:
          shouldSwitch= true;
          break;
        }
      } else if (dir == "desc") {
        if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
          document.getElementById(cols[columnOrder].id + '-btn').setAttribute("data-dir", "desc");
          //if so, mark as a switch and break the loop:
          shouldSwitch = true;
          break;
        }
      }
    }
    if (shouldSwitch) {
      /*If a switch has been marked, make the switch
      and mark that a switch has been done:*/
      rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
      switching = true;
      //Each time a switch is done, increase this count by 1:
      switchcount ++;      
    } else {
      /*If no switching has been done AND the direction is "asc",
      set the direction to "desc" and run the while loop again.*/
      if (switchcount == 0 && dir == "asc") {
        dir = "desc";
        switching = true;
      }
    }
  }
}

  const createResizableTable = function (table) {
      const cols = table.querySelectorAll('th');
      [].forEach.call(cols, function (col) {
          // Add a resizer element to the column
          const resizer = document.createElement('div');
          resizer.classList.add('resizer');

          // Set the height
          resizer.style.height = table.offsetHeight + 'px';

          col.appendChild(resizer);

          createResizableColumn(col, resizer);
      });
  };

  const createResizableColumn = function (col, resizer) {

      let x = 0;
      let w = 0;

      const mouseDownHandler = function (e) {
          x = e.clientX;

          const styles = window.getComputedStyle(col);
          w = parseInt(styles.width, 10);

          document.addEventListener('mousemove', mouseMoveHandler);
          document.addEventListener('mouseup', mouseUpHandler);

          resizer.classList.add('resizing');
      };

      const mouseMoveHandler = function (e) {
          const dx = e.clientX - x;
          col.style.width = (w + dx) + 'px';
      };

      const mouseUpHandler = function () {
          resizer.classList.remove('resizing');
          document.removeEventListener('mousemove', mouseMoveHandler);
          document.removeEventListener('mouseup', mouseUpHandler);
      };

      resizer.addEventListener('mousedown', mouseDownHandler);
  };

