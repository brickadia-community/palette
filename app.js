
// poor man's jquery
const $ = document.querySelector.bind(document);
const $$ = (q, el) => Array.from((el || document).querySelectorAll(q));

let pixels, dropWidth, dropHeight;

const debounceRepaint = debounce(repaintPreview, 1000);

const history = [];
let undoStack = [];
let used = [];
let shiftDown = false;
let altDown = false;
let previewOk = false;
const piOver4 = Math.PI/4;

const magic = 'palette.brickadia.dev'.split('').map(p => p.charCodeAt(0));

// turn bytes into hex
const hexFromBytes = rgb => rgb.map(i => i.toString(16).padStart(2, '0')).join('');

// add a palette snapshot to history
// if you read this code and want to kill me, I understand
function snapshot() {
  history.push($('#palette').innerHTML);
  save();
  debounceRepaint();
  // remove entries over 1000
  history.splice(1000);
  undoStack = [];
}

// undo an undo
function redo() {
  if (!undoStack.length) return;
  const state = undoStack.pop();
  history.push(state);
  $('#palette').innerHTML = state;
  save();
  debounceRepaint();
}

// undo some history
function undo() {
  if (history.length < 2) return;
  const state = history.pop();
  undoStack.push(state);
  $('#palette').innerHTML = history[history.length - 1];
  save();
  debounceRepaint();
}

// get hex color at
const getHexAt = (x, y) => {
  const off = (
    dropWidth * Math.min(Math.max(y, 0), dropHeight - 1) +
    Math.min(Math.max(x, 0), dropWidth - 1)
  ) * 4;
  return [pixels[off], pixels[off+1], pixels[off+2]].map(i =>
    i.toString(16).padStart(2, '0')).join('');
}

let rowColors = [];
let rowColors2D = [];

// draw the drag color select widget
function drawSelectLine([sX, sY]=[-1,-1], [eX, eY]=[-1,-1], dragSizeX=2, [e2X, e2Y]=[-1, -1], dragSizeY=1) {
  if (!pixels) return;
  // angle between start and end
  let thetaX = Math.atan2(eY - sY, eX - sX);
  // length between start and end
  const lengthX = Math.hypot(sY - eY, sX - eX);
  // size of line divided into chunks
  const segmentX = lengthX / (dragSizeX - 1);

  // if shift key is pressed, round angles to 45deg
  if (shiftDown) {
    thetaX = Math.round(thetaX/(piOver4))*(piOver4);
    eX = sX + Math.cos(thetaX) * lengthX;
    eY = sY + Math.sin(thetaX) * lengthX;
  }

  // same thing for the second drag
  let thetaY = Math.atan2(e2Y - eY, e2X - eX);
  let lengthY = Math.hypot(e2Y - eY, e2X - eX);
  let segmentY = lengthY / (dragSizeY - 1);

  // if shift key is pressed, round angles on y axis to 45deg
  // these can't be done at the same time because thetaY/etc depend on the updated eX/eY
  if (shiftDown && dragSizeY > 1) {
    thetaY = Math.round(thetaY/(piOver4))*(piOver4);
    e2X = eX + Math.cos(thetaY) * lengthY;
    e2Y = eY + Math.sin(thetaY) * lengthY;
    lengthY = Math.hypot(e2Y - eY, e2X - eX);
    segmentY = lengthY / (dragSizeY - 1);
  }

  // size of the pin
  const wedgeSize = 10;

  // reset canvas
  const overlay = $('#overlay');
  const ctx = overlay.getContext('2d');
  ctx.font = '14px \'Inconsolata\'';
  ctx.fontWeight = 'bold';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;

  ctx.clearRect(0, 0, dropWidth, dropHeight);

  // colors used in the drag
  rowColors = [];
  rowColors2D = [];

  if (lengthX < 10)
    return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  dropper.style.display = 'none';

  const markerAt = (x, y, hex) => {
    ctx.save();
    ctx.translate(x, y -1.41 * wedgeSize / 2);
    ctx.beginPath();
    ctx.moveTo(0, 1.41 * wedgeSize / 2);
    ctx.arc(0, -1.41 * wedgeSize / 2, 10, Math.PI, 0);
    ctx.lineTo(0, 1.41 * wedgeSize / 2);
    ctx.closePath();
    ctx.fillStyle = '#' + hex;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'black';
    ctx.stroke();
    ctx.fill();
    ctx.lineWidth = 1;
    const isDuplicate = used.includes(hex) || rowColors.includes(hex);
    ctx.strokeStyle = isDuplicate ? '#f55' : 'white';
    ctx.stroke();

    // draw an X for duplicate colors
    if (isDuplicate) {
      ctx.translate(0, -1.14 * wedgeSize/2);
      ctx.fillStyle = 'black'
      ctx.fillText('x', 1, 1);
      ctx.fillStyle = 'white'
      ctx.fillText('x', 0, 0);
    }

    rowColors.push(hex);
    rowColors2D[rowColors2D.length - 1].push(hex);

    ctx.restore();
  };

  for (let j = 0; j < dragSizeY; j++) {
    rowColors2D.push([]);
    const offX = dragSizeY > 1 ? Math.round(Math.cos(thetaY) * j * segmentY + sX) : sX;
    const offY = dragSizeY > 1 ? Math.round(Math.sin(thetaY) * j * segmentY + sY) : sY;
    ctx.save();
    ctx.translate(offX, offY);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(eX - sX, eY - sY);
    ctx.closePath();
    ctx.stroke();

    for (let i = 0; i < dragSizeX; i++) {
      const x = Math.round(Math.cos(thetaX) * i * segmentX);
      const y = Math.round(Math.sin(thetaX) * i * segmentX);

      if (dragSizeY > 1 && j === 0) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x + Math.round(Math.cos(thetaY) * lengthY),
          y + Math.round(Math.sin(thetaY) * lengthY),
        );
        ctx.closePath();
        ctx.stroke();
      }

      markerAt(x, y, getHexAt(x + offX, y + offY));
    }
    ctx.restore();
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const text = 'Selection: ' + dragSizeX + (dragSizeY > 1 ? ' x ' + dragSizeY : '');
  ctx.fillStyle = 'white'
  ctx.fillText(text, 6, 6);
  ctx.fillStyle = 'black'
  ctx.fillText(text, 5, 5);
}

let dragging = false;
let dragSizeX = 2;
let dragSizeY = 1;
let was2D = false;
let startPos = [-1, -1]; // drag start position
let dragPosX = [-1, -1]; // first dimension dragging
let dragPosY = [-1, -1]; // second dimension dragging

// length of drag
const dragLength = () => Math.hypot(
  startPos[1] - (dragSizeY > 1 ? dragPosY[1] : dragPosX[1]),
  startPos[0] - (dragSizeY > 1 ? dragPosY[0] : dragPosX[0]),
);

// insert a list of colors
const insertColors = (colors, forceGroup) => {
  const selected = $('.selected');
  const hex = colors[0];
  if (!selected || forceGroup) {
    // create a new group if there is nothing currently selected
    const group = createGroup([], colors.length !== 1);
    for (const hex of colors)
      group.appendChild(createColor(hex, true));
    if (!forceGroup)
      snapshot();

  } else if (selected.classList.contains('group')) {
    // add a new color to the group if a group is selected
    for (const hex of colors)
      selected.appendChild(createColor(hex, true));
    snapshot();

  // a color is selected but we're dragging - add after this color
  } else if (selected.classList.contains('color') && colors.length > 1) {
    colors.reverse();
    for(const hex of colors)
      selected.after(createColor(hex, true));
    snapshot();

  } else if (colors.length === 1 && selected.classList.contains('color') && selected.getAttribute('hex') !== hex) {
    // update a color if a color is selected
    selected.style.backgroundColor = '#' + hex;
    selected.setAttribute('hex', hex);
    snapshot();
  }
}

window.onload = () => {
  repaintPreview();
  $('#downloadButton').onclick = savePreset;
  $('#selector').style.display = 'none';
  // hide the dropper on mouse leave
  $('#selector').onmouseleave = e => {
    const dropper = $('#dropper');
    dropper.style.display = 'none';
    document.body.style.overflow = 'auto';
    drawSelectLine();
    dragging = false;
  };

  $('#selector').onmousedown = e => {
    altDown = e.altKey;
    shiftDown = e.shiftKey;

    const { layerX: x, layerY: y } = e;

    if (!pixels) return;

    // left button
    if (e.button === 0) {
      startPos = [x, y];
      dragPosX = [x, y];
      dragPosY = [-1, -1];
      dragSizeY = 1;
      dragging = true;
      was2D = false;
    }
    // right button
    if (e.button === 2 && dragging && dragLength() >= 10) {
      if (dragSizeY > 1) {
        dragPosY = [-1, -1];
        dragSizeY = 1;
      } else {
        dragPosY = [x, y];
        dragSizeY = 2;
        was2D = true;
      }
    }
  };
  $('#selector').oncontextmenu = e => {
    altDown = e.altKey;
    shiftDown = e.shiftKey;

    if (dragging && dragLength() >= 10) {
      e.preventDefault();
      e.stopPropagation();
      e.cancelBubble = true;
    }
  }

  const resetCopy = debounce(() => $('.preview').classList.remove('copied'), 1000);
  const resetDownload = debounce(() => $('.preview').classList.remove('saved'), 1000);
  $('.preview').onclick = async e => {
    if (shiftDown) {
      await buildPaletteSave();
      $('.preview').classList.add('saved');
      resetDownload();
      return;
    }
    try {
      $('#testImg').toBlob(blob => {
        navigator.clipboard.write([
          new ClipboardItem({'image/png': blob})
        ]);
        $('.preview').classList.add('copied');
        resetCopy();
      });
    } catch (err) {
      console.error('error getting image from canvas', err);
    }
  };

  window.onwheel = e => {
    altDown = e.altKey;
    shiftDown = e.shiftKey;

    if (dragging) {
      if (dragSizeY > 1 && !altDown) {
        dragSizeY = Math.min(Math.max(dragSizeY - Math.sign(e.deltaY), 2), 16);
      } else {
        dragSizeX = Math.min(Math.max(dragSizeX - Math.sign(e.deltaY), 2), 16);
        if (altDown) {
          dragSizeY = shiftDown ? dragSizeX : Math.max(Math.min(Math.floor(
            Math.abs(dragPosY[0] - startPos[0])/
            (Math.abs(dragPosY[1] - startPos[1]))*dragSizeX+1
          ), 16), 2);
        }
      }
      drawSelectLine(startPos, dragPosX, dragSizeX, dragPosY, dragSizeY);
    }
  };

  $('#selector').onmouseup = e => {
    altDown = e.altKey;
    shiftDown = e.shiftKey;

    if (e.button === 0 && dragging && was2D) {
      $('#selector').onclick(e);
    }
  };

  // set the eyedrop color on hover
  $('#selector').onmousemove = e => {
    altDown = e.altKey;
    shiftDown = e.shiftKey;

    const { layerX: x, layerY: y } = e;
    const dropper = $('#dropper');

    if (dragging) {
      if (altDown) {
        if (shiftDown) {
          const dx = (x - startPos[0]);
          const dy = (y - startPos[1]);
          const max = Math.max(Math.abs(dx), Math.abs(dy));
          dragPosX = [startPos[0], startPos[1] + max * Math.sign(dy)]
          dragPosY = [startPos[0] + max * Math.sign(dx), startPos[1] + max * Math.sign(dy)];
          dragSizeY = dragSizeX;
        } else {
          dragPosX = [startPos[0], y]
          dragPosY = [x, y];
          dragSizeY = Math.max(Math.min(Math.floor(
            Math.abs(dragPosY[0] - startPos[0])/
            (Math.abs(dragPosY[1] - startPos[1]))*dragSizeX+1
          ), 16), 2);
        }
      } else {
        if (dragSizeY > 1) {
          dragPosY = [x, y];
          drawSelectLine(startPos, dragPosX, dragSizeX, dragPosY, dragSizeY);
          return;
        } else {
          dragPosX = [x, y];
        }
      }
      if (dragLength() >= 10) {
        drawSelectLine(startPos, dragPosX, dragSizeX, dragPosY, dragSizeY);
        document.body.style.overflow = 'hidden';
        return;
      } else {
        drawSelectLine();
        document.body.style.overflow = 'flex';
      }
    }

    if (!pixels) return;

    const off = (dropWidth * y + x) * 4;
    if ((pixels[off+3]) === 0) {
      dropper.style.display = 'none';
      return;
    }
    dropper.style.display = 'flex';
    dropper.style.left = x + 'px';
    dropper.style.top = y + 'px';
    if (y < 40) {
      dropper.style.transform = 'translate(-50%, 0)';
    } else {
      dropper.style.transform = 'translate(-50%, -100%)';
    }
    dropper.style.backgroundColor = `rgb(${pixels[off]}, ${pixels[off+1]}, ${pixels[off+2]})`;
    const hex = getHexAt(x, y);
    if (used.includes(hex))
      dropper.innerHTML = '&check;';
    else
      dropper.innerHTML = '';
  };

  // add the color on click
  $('#selector').onclick = e => {
    altDown = e.altKey;
    shiftDown = e.shiftKey;

    if (!pixels) return;

    // handle drag color selectin
    if (dragging) {
      const length = Math.hypot(startPos[1] - dragPosX[1], startPos[0] - dragPosX[0]);
      document.body.style.overflow = 'auto';
      dragging = false;
      // insert multiple colors if the drag is a success
      if (length >= 10) {
        if (rowColors2D.length > 1) {
          for (const colors of rowColors2D) {
            insertColors(colors, true);
          }
          snapshot();
        } else {
          insertColors(rowColors);
        }
        drawSelectLine([-1, -1], [-1, -1], 0);
        return;
      }
    }
    drawSelectLine([-1, -1], [-1, -1], 0);
    const { layerX: x, layerY: y } = e;
    const off = (dropWidth * y + x) * 4;
    const hex = hexFromBytes([pixels[off], pixels[off+1], pixels[off+2]]);

    if ((pixels[off+3]) === 0) return;

    // insert an individual color
    insertColors([hex]);
    genFavicon('#' + hex);
  };

  $$('.images img').forEach(el => el.onclick = () => renderEyedropImage(el));

  // allow dropping of files in
  document.body.ondrop = async e => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.items) {
      const item = e.dataTransfer.items[0];
      const file = item.getAsFile();
      if (!file) return;
      if (item.type === 'text/plain' ||
        file.name.match(/.(bp|pal|txt|gpl)$/i)
      ) {
        try {
          importText(await file.text());
        } catch (err) {
          console.warn('error parsing text', file, err);
        }
      }

      if (item.type.startsWith('image/')) {
        try {
          importImage(file);
        } catch (err) {
          console.warn('error importing image', file, err);
        }
      }
    }
  };

  document.body.ondragover = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  try {
    if (localStorage.temp) {
      initPalette(JSON.parse(localStorage.temp));
    } else {
      initPalette();
    }
  } catch (e) {
    console.warn('error parsing json', e);
    initPalette();
  }
  snapshot();
};

// swap to elements in dom
function swapDom(a, b) {
   const aParent = a.parentNode;
   const bParent = b.parentNode;

   const aHolder = document.createElement('div');
   const bHolder = document.createElement('div');

   aParent.replaceChild(aHolder, a);
   bParent.replaceChild(bHolder, b);

   aParent.replaceChild(b, aHolder);
   bParent.replaceChild(a, bHolder);
}

// when you paste, render the image on the canvas
document.onpaste = e => {
  const items = Array.from(e.clipboardData.items)
    .filter(i => i.type.indexOf('image') === 0);

  if (items.length > 0) {
    importImage(items[0].getAsFile());
  } else {
    let pasteData = e.clipboardData.getData('Text');
    importText(pasteData);
  }
};

// get the color or group given a column and a row
const getSwatchAt = (col, row=-1) => {
  const group = $$('.group')[col];
  const colors = $$('.color', group);
  return row > -1 && colors.length > row ?
  colors[Math.min(row, colors.length - 1)]
  : row == -2
    ? colors[colors.length - 1]
    : group;
};

// get the position of a color/group
const getIndex = el => {
  const groups = $$('.group');
  // if the selected thing is a group, return -1 for the row
  if (el.classList.contains('group')) return [groups.findIndex(e => e == el), -1];
  // otherwise return the group and index
  return [groups.findIndex(e => e == el.parentNode), $$('.color', el.parentNode).findIndex(e => e == el)];
};

// keybinds
document.onkeydown = e => {
  const selected = $('.selected');

  if (e.key === 'Shift') {
    shiftDown = true;
  }
  if (e.key === 'Alt') {
    altDown = true;
  }

  // if shift key is pressed, use swap instead of select
  const modFn = e.shiftKey ? el => {
    // if the swap would be illegal, do a select instead
    if (el.classList.contains('group') && selected.classList.contains('color') ||
      selected.classList.contains('group') && el.classList.contains('color'))
      return select(el);

    // swap the dom and save to history
    swapDom(selected, el);
    snapshot();
  } : select;

  // undo and redo on CTRL + Z
  if (e.code === 'KeyZ' && e.ctrlKey) {
    if (e.shiftKey)
      redo()
    else
      undo();
    save();

  // rename group on r
  } else if (e.code === 'KeyR' && !e.ctrlKey && !e.shiftKey) {
    if (!selected || !selected.classList.contains('group')) return;
    const name = prompt('Enter a column name', selected.getAttribute('name'));
    if (name) {
      selected.setAttribute('name', name);
      snapshot();
    }

  // change palette description on shift R
  } else if (e.code === 'KeyR' && !e.ctrlKey && e.shiftKey) {
    const btn = $('#palette > .add');
    const description = prompt('Enter a palette description', btn.getAttribute('description'));
    if (description) {
      btn.setAttribute('description', description);
      snapshot();
    }

  } else if (e.code === 'KeyC' && !e.ctrlKey && !e.shiftKey) {
    $('#colorPicker').value = '#' + (selected && selected.classList.contains('color')
      ? selected.getAttribute('hex')
      : 'ffffff');
    $('#colorPicker').onchange = e => {
      insertColors([e.target.value.replace(/^#/, '')]);
      $('#colorPicker').onchange = () => {};
    };
    $('#colorPicker').click();

  // save on ctrl s
  } else if (e.code === 'KeyS' && e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    savePreset();

  } else if ((e.code === 'KeyS' || e.code === 'KeyW') && e.ctrlKey) {
    e.preventDefault(); // prevent annoying save popup
  } else if (e.code === 'KeyW') {

    // if nothing is selected, select the first group
    if (!selected) return modFn(getSwatchAt(0));

    const [col, row] = getIndex(selected);
    const lastColor = getSwatchAt(col, -2);
    // if the group is selected, select the last color
    if ((row === -1 || row === 0 && e.shiftKey) && lastColor) {
      modFn(lastColor);
    // select the group if it's the first color
    } else if (row === 0) {
      modFn(getSwatchAt(col));
    // otherwise select the previous color
    } else {
      modFn(getSwatchAt(col, row-1));
    }
  } else if (e.code === 'KeyS') {
    const selected = $('.selected');
    // if nothing is selected, select the first group
    if (!selected) return modFn(getSwatchAt(0));

    const [col, row] = getIndex(selected);
    const firstColor = getSwatchAt(col, 0);
    // if the group is selected, select the last color
    if (row === -1 && firstColor) {
      modFn(firstColor);

    // otherwise select the previous color
    } else {
      // if there's no more colors in this group, select the group
      if (row + 1 >= $$('.color', getSwatchAt(col)).length) {
        modFn(getSwatchAt(col, e.shiftKey ? 0 : -1));
      } else {
        // otherwise select the next color
        modFn(getSwatchAt(col, row+1));
      }
    }

  } else if (e.code === 'KeyA' && !e.ctrlKey) {
    // if nothing is selected, select the first group
    if (!selected) return modFn(getSwatchAt(0));

    // select the previous group + wrap around
    const [col, row] = getIndex(selected);
    const numGroups = $$('.group').length;
    if (numGroups < 2) return;
    modFn(getSwatchAt((col + numGroups - 1) % numGroups, row));

  } else if (e.code === 'KeyD' && !e.ctrlKey) {
    if (!selected) return modFn(getSwatchAt(0));

   // select the next group + wrap around
    const [col, row] = getIndex(selected);
    const numGroups = $$('.group').length;
    if (numGroups < 2) return;
    modFn(getSwatchAt((col + 1) % numGroups, row));

  // move color to the left
  } else if (e.code === 'KeyA' && e.ctrlKey) {
    e.preventDefault();
    // if nothing is selected, ignore
    if (!selected) return;

    // select the previous group + wrap around
    const [col, row] = getIndex(selected);
    const numGroups = $$('.group').length;
    if (numGroups < 2) return;
    const el = getSwatchAt((col + numGroups - 1) % numGroups, row);

    // ignore group movements
    if (selected.classList.contains('group')) return;

    // if the dest is a group, put the color in there
    if (el.classList.contains('group')) {
      el.appendChild(selected);
    } else {
      // move selected to the element
      el.before(selected);
    }

    snapshot();

  // move color to the right
  } else if (e.code === 'KeyD' && e.ctrlKey) {
    e.preventDefault();
    if (!selected) return;

   // select the next group + wrap around
    const [col, row] = getIndex(selected);
    const numGroups = $$('.group').length;
    if (numGroups < 2) return;
    const el = getSwatchAt((col + 1) % numGroups, row);

    // ignore group movements
    if (selected.classList.contains('group')) return;

    // if the dest is a group, put the color in there
    if (el.classList.contains('group')) {
      el.appendChild(selected);
    } else {
      // move selected to the element
      el.before(selected);
    }

    snapshot();

  // insert a color in the group or after the existing swatch
  } else if (e.code === 'KeyE' && !e.shiftKey) {
    if (!selected) {
      const group = createGroup([]);
      group.appendChild(createColor('ffffff'));
      snapshot();
      return;
    }

    // if the dest is a group, put the color in there
    if (selected.classList.contains('group')) {
      selected.appendChild(createColor('ffffff'));
    } else {
      // move selected to the element
      selected.after(createColor('ffffff'));
    }
    snapshot();


  // delete everything
  } else if (e.code === 'Delete' && e.shiftKey && e.ctrlKey) {
    e.preventDefault();
    initPalette();
    snapshot();

  // delete selected thing
  } else if (e.code === 'Delete' && !e.shiftKey && !e.ctrlKey || e.code === 'KeyX' && e.shiftKey) {
    if (!selected) return;

    // delete a group, select previous group
    if (selected.classList.contains('group')) {
      if (selected.nextSibling && selected.nextSibling.classList.contains('group')) {
        // select the next group
        select(selected.nextSibling);
      } else if (selected.previousSibling && selected.previousSibling.classList.contains('group')) {
        // select the previous group
        select(selected.previousSibling);
      } else {
        // select the first group
        const groups = $$('.group').filter(g => g !== selected);
        if (groups.length > 0)
          select(groups[0]);
      }

    // delete a color, select previous color
    } else if (selected.classList.contains('color')) {
      // if the previous sibling is a color, select it
      if (selected.nextSibling && selected.nextSibling.classList.contains('color'))
        select(selected.nextSibling);
      else if (selected.previousSibling && selected.previousSibling.classList.contains('color'))
        select(selected.previousSibling);
      else
        // select the group instead
        select(selected.parentNode);
    }
    selected.remove();
    snapshot();

  // delete whatever is selected
  } else if (e.code === 'Space') {
    e.preventDefault();
    $$('.selected').forEach(e => e.classList.remove('selected'));

  // next group/new group
  } else if (e.key === 'Enter' || e.code === 'KeyE' && e.shiftKey) {
    // nothing is selected - create a new group
    if (!selected || selected.classList.contains('color')) {
      createGroup([]);
      snapshot();

    // a group is selected
    } else if (selected.classList.contains('group')) {
      // if there is a next group, select it
      if (selected.nextSibling) {
        select(selected.nextSibling);
      } else {
        // otherwise create a new group
        createGroup([]);
        snapshot();
      }
    }
  } else {
    // debug key stuff
    // console.log(e.key, e.code, e);
  }
};

document.onkeyup = e => {
  if (e.key === 'Shift') {
    shiftDown = false;
  }
  if (e.key === 'Alt') {
    altDown = false;
  }
};

// save the preset as a .bp
function savePreset() {
  if ($$('.color').length === 0) return;

  const name = prompt('Enter a save name', localStorage.lastName || 'Generated');
  if (typeof name === 'object') return;
  localStorage.lastName = name;
  $('#download').href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(save(), 0, 2));
  $('#download').download = name + '.bp';
  $('#download').click();
}

// update the color selecting canvas with an image
function renderEyedropImage(image) {
  // create the element
  const canvas = $('#selector');
  canvas.style.display = 'block';
  const overlay = $('#overlay');
  const ctx = canvas.getContext('2d');
  const octx = overlay.getContext('2d');
  const margin = 32;

  // set the canvas size
  canvas.style.width =
  overlay.style.width = (
    canvas.width = ctx.canvas.width =
    overlay.width = octx.canvas.width =
    dropWidth = (image.naturalWidth + margin * 2)
  ) + 'px';
  canvas.style.height =
  overlay.style.height = (
    canvas.height = ctx.canvas.height =
    overlay.height = octx.canvas.height =
    dropHeight = (image.naturalHeight + margin * 2)
  ) + 'px';
  $('.eyedrop-container').style.width = dropWidth + 18 + 'px';
  $('.eyedrop-container').style.height = dropHeight + 18 + 'px';


  // draw the image
  ctx.drawImage(image, margin, margin);
  const imageData = ctx.getImageData(0, 0, dropWidth, dropHeight);
  pixels = imageData.data;

  const offX = dropWidth - margin - 1;
  const offY = dropHeight - margin - 1;
  let isPreview = true;
  for (let i = 0; i < magic.length/3; i++) {
    const shift = ((offX - i) + (dropWidth * offY)) * 4;
    if (
      magic[i * 3 + 0] !== pixels[shift + 0] ||
      magic[i * 3 + 1] !== pixels[shift + 1] ||
      magic[i * 3 + 2] !== pixels[shift + 2])
      isPreview = false;
  }

  // if this is a preview image, import it based on the mini palette in the corner
  if (isPreview) {
    const groups = [];
    for (let x = 0; x < 16; x++) {
      if (pixels[((offX - x) + (dropWidth * (offY - 1))) * 4 + 3] === 0) break;
      groups.push([])
      for (let y = 0; y < 16; y++) {
        const shift = ((offX - x) + (dropWidth * (offY - y - 1))) * 4;
        // if there is an alpha, end this group
        if (pixels[shift + 3] === 0) break;
        // add the color to the group
        groups[groups.length - 1].push(linearRGB([
          pixels[shift + 0], pixels[shift + 1], pixels[shift + 2]
        ]));
      }
      // remove empty group
      if (groups[groups.length - 1].length === 0) groups.pop();
    }

    // importh the preview image
    if (groups.length > 0) {
      const data = {
        description: 'Imported from palette.brickadia.dev preview',
        groups: groups.map(gr => ({
          colors: gr.map(([r,g,b]) =>
            ({r, g, b, a: 255}))
        })),
      }
      initPalette(data);
      snapshot();
    }
  }

  $('.instructions').style.display = 'none';
}

// create + button
function addBtn() {
  const elem = document.createElement('div');
  elem.className = 'add button';
  elem.innerText = '+';
  return elem;
}

// select an element
function select(elem) {
  if (!elem) return;
  $$('.selected').forEach(e => e.classList.remove('selected'));
  elem.classList.add('selected');
}

// create a color
function createColor(hex, ignoreSelect) {
  const colorElem = document.createElement('div');
  colorElem.className = 'color';
  colorElem.setAttribute('hex', hex);
  colorElem.style.backgroundColor = '#' + hex;
  if (!ignoreSelect)
    select(colorElem);
  return colorElem;
}

// create a group
function createGroup(colors, ignoreSelect) {
  const palette = $('#palette');
  const group = document.createElement('div');
  group.className = 'group';
  group.setAttribute('name', 'Group ' + ($$('.group').length + 1));
  const stub = document.createElement('div');
  stub.className = 'stub button';

  group.appendChild(stub);
  group.appendChild(addBtn());
  palette.appendChild(group);
  if (!ignoreSelect)
    select(group);

  for (const {r: lR, g: lG, b: lB} of colors) {
    const [r, g, b] = sRGB([lR, lG, lB]);
    group.appendChild(createColor([r, g, b].map(i =>
      i.toString(16).padStart(2, '0')).join(''), true));
  }

  return group;
}

// convert srgb to linear rgb
const linearRGB = rgba =>
  rgba.map((c, i) => i === 3
    ? c
    : Math.round(((c/255) > 0.04045 ? Math.pow((c/255) * (1.0 / 1.055) + 0.0521327, 2.4 ) : (c/255) * (1.0 / 12.92))*255)
  );

// convert linear rgb to srgb
const sRGB = linear =>
  linear.map((c, i) => i === 3
    ? c
    : Math.round(((c/255) > 0.0031308
      ? 1.055 * Math.pow((c/255), 1/2.4) - 0.055
      : c / 255 * 12.92)*255)
  );

// save the palette to data
function save() {
  used = [];
  const data = {
    // generate the preset file
    formatVersion: '1',
    presetVersion: '1',
    type: 'ColorPalette',
    data: {
      description: $('#palette > .add').getAttribute('description') || 'Built with palette.brickadia.dev',
      // populate columns
      groups: $$('.group').map((c, columnIndex) => {
        // convert colors to linear rgb from whatever format is thrown in
        return {
          name: c.getAttribute('name') || ('Group ' + (columnIndex + 1)),
          colors: $$('.color', c).map(e => {
            // a technique so cursed you will shit the bed (pulling rgb from hex)
            let [sR, sG, sB] = e.style.backgroundColor.match(/[\d\.]+/g).map(Number);

            // convert to hex
            const hex = hexFromBytes([sR, sG, sB]);
            used.push(hex);

            // convert sRGB to linear rgb
            const [r, g, b]  = linearRGB([sR, sG, sB]);
            return {r, g, b, a: 255};
          })
        };
      }).filter(g => g.colors.length > 0),
    },
  };
  localStorage.temp = JSON.stringify(data.data);
  return data;
}

// load a palette into DOM
function initPalette(data) {
  if (!data) {
    data = {
      description: 'Built with palette.brickadia.dev',
      groups: [],
    }
  }

  const palette = $('#palette');
  palette.innerHTML = '';

  // handle all click events through the parent due to the nature of the undo/redo
  $('#palette').onclick = e => {
    const elem = e.target;

    // when clicking on palette bg, deselect selected
    if (elem.id === 'palette') {
      $$('.selected').forEach(e => e.classList.remove('selected'));
      return;
    }

    // toggle color select
    if (elem.classList.contains('color')) {
       if (elem.classList.contains('selected'))
          elem.classList.remove('selected');
      else
        select(elem);
    }
    // detect clicks on buttons
    if (elem.classList.contains('button')) {
      // button is in the group
      if (elem.parentNode.classList.contains('group')) {
        const group = elem.parentNode;
        // group add button
        if (elem.classList.contains('add')) {
          group.appendChild(createColor('ffffff'));
          snapshot();
        }

        // group stub button (toggle select)
        if (elem.classList.contains('stub')) {
           if (group.classList.contains('selected'))
            group.classList.remove('selected');
          else
            select(group);
        }
      } else {

        // palette add button
        if (elem.classList.contains('add')) {
          createGroup([]);
          snapshot();
        }
      }
    }
  };

  const btn = addBtn();
  btn.setAttribute('description', data.description || 'Generated palette')
  palette.appendChild(btn);

  let i = 0;
  for (const group of data.groups) {
    const el = createGroup(group.colors, true);
    el.setAttribute('name', group.name || ('Col' + ++i))
  }
}

// distance between two colors
function colorDifference([r1, g1, b1], [r2, g2, b2]) {
  return (
    (r1 - r2) * (r1 - r2) +
    (g1 - g2) * (g1 - g2) +
    (b1 - b2) * (b1 - b2)
  );
}

// debounce fn
function debounce(func, wait, immediate) {
  var timeout;
  return function() {
    var context = this, args = arguments;
    var later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
};

// repaint test palette
async function repaintPreview() {
  previewOk = false;
  const canvas = $('#testImg');
  const parrot = $('#parrot');
  const ctx = canvas.getContext('2d');
  const { width, height } = parrot;

  const swatchSize = 8;
  const swatchMargin = 2;
  const groups = $$('.group');

  const previewWidth = width + (swatchSize + swatchMargin) * Math.min(groups.length, 16);
  canvas.style.width = (ctx.canvas.width = previewWidth) + 'px';
  canvas.style.height = (ctx.canvas.height = height) + 'px';

  // get the colors from this palette
  const colors = $$('.color').map(c => c.style.backgroundColor.match(/[\d\.]+/g).map(Number).slice(0, 3));

  // render the parrot
  ctx.drawImage(parrot, 0, 0, width, height);
  if (colors.length < 2) return;

  // get the image data
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // cached color match
  const cache = {};

  console.time('Paint');
  // await this to wait for a new frame (async rendering)
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));

  const text = localStorage.temp;

  // render the preview parrot using the palette
  let lastFrame = performance.now();

  // iterate through pixels
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i+=4) {

      // get the currnet color
      const color = [pixels[i], pixels[i+1], pixels[i+2]];
      // use a cached color if we haven't calculated the closest color for this pixel yet
      if (!cache[color]) {
        // find the closest color to the selected one
        let closest = colors[0];
        let dist = colorDifference(closest, color);
        for (let j = 0; j < colors.length; j++) {
          const dist2 = colorDifference(colors[j], color);
          if (dist > dist2) {
            closest = colors[j];
            dist = dist2;
          }
        }
        cache[color] = closest;
      }

      // update the image data for the canvas
      pixels[i] = cache[color][0];
      pixels[i+1] = cache[color][1];
      pixels[i+2] = cache[color][2];
    }

    // if more than 10MS have passed, render the image and wait for the next frame
    if (performance.now() - lastFrame > 10) {
      ctx.putImageData(imageData, 0, 0);
      // this will stop the website from freezing up for hundreds of milliseconds
      await frame();
      lastFrame = performance.now();
    }
  }

  // render final image
  ctx.putImageData(imageData, 0, 0);

  for (let i = 0; i < Math.min(groups.length, 16); i++) {
    const swatches = $$('.color', groups[i]);
    for (let j = 0; j < Math.min(swatches.length, 16); j++) {
      ctx.fillStyle = '#' + swatches[j].getAttribute('hex');
      ctx.fillRect(
        i * (swatchSize + swatchMargin) + width + swatchMargin,
        j * (swatchSize + swatchMargin),
        swatchSize,
        swatchSize,
      );

      ctx.fillRect(
        previewWidth - i - 1,
        height - j - 2,
        1, 1,
      );
    }
  }

  for (let i = 0; i < magic.length / 3; i++) {
    ctx.fillStyle = 'rgb(' + magic.slice(i * 3, i * 3 + 3).join(',') + ')';
    ctx.fillRect(previewWidth - 1 - i, height - 1, 1, 1);
  }

  console.timeEnd('Paint');
  previewOk = true;
};

// import text from clipboard or file
function importText(text) {
  const blocklandRegex = /(((\d{1,3} \d{1,3} \d{1,3} \d{1,3}|\d\.\d{1,} \d\.\d{1,} \d\.\d{1,} \d\.\d{1,})(\s*)(\/\/.*)?\r?\n)+(\r?\n)*DIV:.*)/g;
  const palRegex = /^JASC-PAL\r?\n0100\r?\n\d+\r?\n(\d+ \d+ \d+\r?\n)+/;
  const paintNetRegex = /^; paint\.net Palette File\r?\n(;.*\r?\n)+([a-fA-F0-9]{8}\r?\n)+/;
  const gimpRegex = /^GIMP Palette\r?\n(.+: .*\r?\n)*#\r?\n((\s*\d+\s+\d+\s+\d+(\s+\d+)?(\t.*)?\r?\n)+)$/
  const blMatches = text.replace(/[ ]*\/\/.*/, '').match(blocklandRegex);

  if (blMatches) {
    const data = {
      description: 'Imported from blockland colorset',
      groups: blMatches.map(div => ({
        colors: div
          .match(/(\d{1,3} \d{1,3} \d{1,3} \d{1,3}|\d\.\d{1,} \d\.\d{1,} \d\.\d{1,} \d\.\d{1,})/g)
          .map(c => {
            let [sR, sG, sB] = c.split(' ').map(Number);
            if (c.match(/\d\.\d{1,} \d\.\d{1,} \d\.\d{1,} \d\.\d{1,}/)) {
              sR *= 255;
              sG *= 255;
              sB *= 255;
            }
            const [r, g, b] = linearRGB([sR, sG, sB]);
            return { r, g, b, a: 255 };
          }),
        name: div.match(/DIV: ?(.*)/)[1],
      })),
    }
    initPalette(data);
    snapshot();
    return;
  }

  const palMatches = text.match(palRegex);
  if (palMatches) {
    const colors = text
    .match(/(\d{1,3} \d{1,3} \d{1,3})/g)
    .map(c => {
      let [sR, sG, sB] = c.split(' ').map(Number);
      const [r, g, b] = linearRGB([sR, sG, sB]);
      return { r, g, b, a: 255 };
    });
    const groups = [];
    while(colors.length) {
      groups.push({colors: colors.splice(0, 16), name: ''});
    }
    const data = {
      description: 'Imported from pal file',
      groups,
    }
    initPalette(data);
    snapshot();
    return;
  }

  if (text.match(paintNetRegex)) {
    const colors = text
      .match(/([a-fA-F0-9]{8})(?:\r?\n)/g)
      .map(c => {
        const [, ...hex] = c.match(/..(..)(..)(..)/);
        const [r, g, b] = linearRGB(hex.map(c => parseInt(c, 16)));
        return { r, g, b, a: 255 };
      });
    const groups = [];
    while(colors.length) {
      groups.push({colors: colors.splice(0, 16), name: ''});
    }
    const data = {
      description: 'Imported from paint.net palette',
      groups,
    }
    initPalette(data);
    snapshot();
    return;
  }

  const gimpMatch = text.match(gimpRegex);
  if (gimpMatch) {
    const colors = gimpMatch[2]
      .match(/\s*(\d+)\s+(\d+)\s+(\d+)(\s+\d+)?(\t.*)?\r?\n/g)
      .map(c => {
        const [r, g, b] = linearRGB(c.match(/\d+/g).slice(0, 3).map(Number));
        return { r, g, b, a: 255 };
      });
    const groups = [];
    while(colors.length) {
      groups.push({colors: colors.splice(0, 16), name: ''});
    }
    const data = {
      description: 'Imported from gimp palette',
      groups,
    }
    initPalette(data);
    snapshot();
    return;
  }

  // try to parse the pasted data
  if (text && text.length > 0) {
    try {
      const data = JSON.parse(text);
      if (data.formatVersion === '1' &&
        data.presetVersion === '1' &&
        data.type === 'ColorPalette') {
        initPalette(data.data);
        snapshot();
      }
    } catch (e) {
      console.error('error pasting json', e);
    }
  }
}

// import a file as an image
function importImage(file) {
  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.src = event.target.result;
    img.onload = res => {
      if (img.width > 0 && img.height > 0) {
        renderEyedropImage(img);
      }
    }
  };
  reader.readAsDataURL(file);
}

// generate a favicon
function genFavicon(color) {
  var canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.canvas.width = 32;
  ctx.canvas.height = 32;

  const wedgeSize = 10;
  ctx.save();
  ctx.translate(16, 28 - 1.41 * wedgeSize / 2);
  ctx.beginPath();
  ctx.moveTo(0, 1.41 * wedgeSize / 2);
  ctx.arc(0, -1.41 * wedgeSize / 2, 10, Math.PI, 0);
  ctx.lineTo(0, 1.41 * wedgeSize / 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'white';
  ctx.stroke();

  const link = document.createElement('link');
  link.type = 'image/x-icon';
  link.rel = 'shortcut icon';
  link.href = canvas.toDataURL('image/x-icon');
  document.getElementsByTagName('head')[0].appendChild(link);
}
genFavicon(`hsl(${Math.random() * 360}, 100%, 50%)`);

function buildPaletteSave() {
  const name = prompt('Enter a save name', 'palette_demo');
  if (!name) return;

  const author = {
    id: '1f7bdb6f-319c-47aa-a1d6-4316c494c553',
    name: 'palette.brickadia.dev',
  };

  const bricks = [];

  // iterate through all colors
  const groups = $$('.group');
  for (let x = 0; x < Math.min(groups.length, 16); x++) {
    const swatches = $$('.color', groups[x]);
    for (let y = 0; y < Math.min(swatches.length, 16); y++) {
      const [r, g, b] = linearRGB(swatches[y].style.backgroundColor.match(/[\d\.]+/g).map(Number).slice(0, 3));
      // build a brick for each material
      for (let i = 0; i < 4; i++) {
        const matX = ((i % 2) * 17) * 20;
        const matY = (Math.floor(i / 2) * 17) * 20;
        bricks.push({
          asset_name_index: 0,
          material_index: i,
          color: [r, g, b, 255],
          size: [5, 10, 2],
          position: [x * 20 + matX + 5, y * 20 + matY + 5, 2],
        }, {
          asset_name_index: 1,
          material_index: i,
          color: [r, g, b, 255],
          size: [5, 10, 2],
          position: [x * 20 + matX + 10 + 5, y * 20 + matY + 5, 2],
        });
      }
    }
  }

  const blob = new Blob([BRS.write({
      version: 4,
      author,
      description: 'Preview palette generated from palette.brickadia.dev',
      brick_owners: [author],
      brick_assets: ['PB_DefaultBrick', 'PB_DefaultTile'],
      materials: [
        'BMC_Plastic',
        'BMC_Glow',
        'BMC_Metallic',
        'BMC_Hologram',
      ],
      bricks,
  })]);

  $('#download').href = URL.createObjectURL(blob);
  $('#download').download = name + '.brs';
  $('#download').click();
}