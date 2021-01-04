
// poor man's jquery
const $ = document.querySelector.bind(document);
const $$ = (q, el) => Array.from((el || document).querySelectorAll(q));

let pixels, dropWidth, dropHeight;

const history = [];
let undoStack = [];
let used = [];

// add a palette snapshot to history
// if you read this code and want to kill me, I understand
function snapshot() {
  history.push($('#palette').innerHTML);
  save();
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
}

// undo some history
function undo() {
  if (history.length < 2) return;
  const state = history.pop();
  undoStack.push(state);
  $('#palette').innerHTML = history[history.length - 1];
}

window.onload = () => {
  // hide the dropper on mouse leave
  $('#selector').onmouseleave = e => {
    const dropper = $('#dropper');
    dropper.style.display = 'none';
  };

  // set the eyedrop color on hover
  $('#selector').onmousemove = e => {
    if (!pixels) return;
    const dropper = $('#dropper');
    const { layerX: x, layerY: y } = e;
    const off = (dropWidth * y + x) * 4;
    if ((pixels[off+3]) === 0) {
      dropper.style.display = 'none';
      return;
    }
    dropper.style.display = 'block';
    dropper.style.left = x + 'px';
    dropper.style.top = y + 'px';
    if (y < 40) {
      dropper.style.transform = 'translate(-50%, 0)';
    } else {
      dropper.style.transform = 'translate(-50%, -100%)';
    }
    dropper.style.background = `rgb(${pixels[off]}, ${pixels[off+1]}, ${pixels[off+2]})`;
    const hex = [pixels[off], pixels[off+1], pixels[off+2]].map(i =>
      i.toString(16).padStart(2, '0')).join('');
    if (used.includes(hex))
      dropper.innerHTML = '&check;';
    else
      dropper.innerHTML = '';
  };

  // add the color on click
  $('#selector').onclick = e => {
    if (!pixels) return;
    const { layerX: x, layerY: y } = e;
    const off = (dropWidth * y + x) * 4;
    const selected = $('.selected');
    const hex = [pixels[off], pixels[off+1], pixels[off+2]].map(i =>
      i.toString(16).padStart(2, '0')).join('');

    if ((pixels[off+3]) === 0) return;

    if (!selected) {
      // create a new group if there is nothing currently selected
      const group = createGroup([]);
      group.appendChild(createColor(hex, true));
      snapshot();

    } else if (selected.classList.contains('group')) {
      // add a new color to the group if a group is selected
      selected.appendChild(createColor(hex, true));
      snapshot();

    } else if (selected.classList.contains('color') && selected.getAttribute('hex') !== hex) {
      // update a color if a color is selected
      selected.style.background = '#' + hex;
      selected.setAttribute('hex', hex);
      snapshot();
    }
  };

  $$('.images img').forEach(el => el.onclick = () => renderEyedropImage(el));

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
    reader.readAsDataURL(items[0].getAsFile());
  } else {
    const pasteData = e.clipboardData.getData('Text');

    const blocklandRegex = /(((\d{1,3} \d{1,3} \d{1,3} \d{1,3}|\d\.\d{3} \d\.\d{3} \d\.\d{3} \d\.\d{3})\r?\n)+DIV:.*)/g;
    const blMatches = pasteData.match(blocklandRegex);
    if (blMatches) {
      const data = {
        description: 'Imported from blockland colorset',
        groups: blMatches.map(div => ({
          colors: div
            .match(/(\d{1,3} \d{1,3} \d{1,3} \d{1,3}|\d\.\d{3} \d\.\d{3} \d\.\d{3} \d\.\d{3})/g)
            .map(c => {
              let [sR, sG, sB] = c.split(' ').map(Number);
              if (c.match(/\d\.\d{3} \d\.\d{3} \d\.\d{3} \d\.\d{3}/)) {
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

    // try to parse the pasted data
    if (pasteData && pasteData.length > 0) {
      try {
        const data = JSON.parse(pasteData);
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
};

// get the color or group given a column and a row
const getAt = (col, row=-1) => {
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

document.onkeydown = e => {
  const selected = $('.selected');

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
    if (!selected || !selected.classList.contains('color')) return;
    $('#colorPicker').value = '#' + selected.getAttribute('hex');
    $('#colorPicker').onchange = e => {
      selected.setAttribute('hex', e.target.value.replace(/^#/, ''))
      selected.style.background = e.target.value;
      snapshot();
      $('#colorPicker').onchange = () => {};
    };
    $('#colorPicker').click();

  // save on ctrl s
  } else if (e.code === 'KeyS' && e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    const name = prompt('Enter a save name', localStorage.lastName || 'Generated');
    if (typeof name === 'object') return;
    localStorage.lastName = name;
    $('#download').href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(save(), 0, 2));
    $('#download').download = name + '.bp';
    $('#download').click();

  } else if ((e.code === 'KeyS' || e.code === 'KeyW') && e.ctrlKey) {
    e.preventDefault(); // prevent annoying save popup
  } else if (e.code === 'KeyW') {

    // if nothing is selected, select the first group
    if (!selected) return modFn(getAt(0));

    const [col, row] = getIndex(selected);
    const lastColor = getAt(col, -2);
    // if the group is selected, select the last color
    if ((row === -1 || row === 0 && e.shiftKey) && lastColor) {
      modFn(lastColor);
    // select the group if it's the first color
    } else if (row === 0) {
      modFn(getAt(col));
    // otherwise select the previous color
    } else {
      modFn(getAt(col, row-1));
    }
  } else if (e.code === 'KeyS') {
    const selected = $('.selected');
    // if nothing is selected, select the first group
    if (!selected) return modFn(getAt(0));

    const [col, row] = getIndex(selected);
    const firstColor = getAt(col, 0);
    // if the group is selected, select the last color
    if (row === -1 && firstColor) {
      modFn(firstColor);

    // otherwise select the previous color
    } else {
      // if there's no more colors in this group, select the group
      if (row + 1 >= $$('.color', getAt(col)).length) {
        modFn(getAt(col, e.shiftKey ? 0 : -1));
      } else {
        // otherwise select the next color
        modFn(getAt(col, row+1));
      }
    }

  } else if (e.code === 'KeyA' && !e.ctrlKey) {
    // if nothing is selected, select the first group
    if (!selected) return modFn(getAt(0));

    // select the previous group + wrap around
    const [col, row] = getIndex(selected);
    const numGroups = $$('.group').length;
    if (numGroups < 2) return;
    modFn(getAt((col + numGroups - 1) % numGroups, row));

  } else if (e.code === 'KeyD' && !e.ctrlKey) {
    if (!selected) return modFn(getAt(0));

   // select the next group + wrap around
    const [col, row] = getIndex(selected);
    const numGroups = $$('.group').length;
    if (numGroups < 2) return;
    modFn(getAt((col + 1) % numGroups, row));

  // move color to the left
  } else if (e.code === 'KeyA' && e.ctrlKey) {
    e.preventDefault();
    // if nothing is selected, ignore
    if (!selected) return;

    // select the previous group + wrap around
    const [col, row] = getIndex(selected);
    const numGroups = $$('.group').length;
    if (numGroups < 2) return;
    const el = getAt((col + numGroups - 1) % numGroups, row);

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
    const el = getAt((col + 1) % numGroups, row);

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
      if (selected.previousSibling && selected.previousSibling.classList.contains('group'))
        // select the previous group
        select(selected.previousSibling);
      else {
        // select the first group
        const groups = $$('.group').filter(g => g !== selected);
        if (groups.length > 0)
          select(groups[0]);
      }

    // delete a color, select previous color
    } else if (selected.classList.contains('color')) {
      // if the previous sibling is a color, select it
      if (selected.previousSibling.classList.contains('color'))
        select(selected.previousSibling);
      else if (selected.nextSibling)
        select(selected.nextSibling);
      else
        // select the group instead
        select(selected.parentNode);
    }
    selected.remove();
    snapshot();

  // delete whatever is selected
  } else if (e.code === 'Space') {
    $$('.selected').forEach(e => e.classList.remove('selected'));

  // next group/new group
  } else if (e.key === 'Enter' || e.code === 'KeyE' && e.shiftKey) {
    // nothing is selected - create a new group
    if (!selected) {
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

// update the color selecting canvas with an image
function renderEyedropImage(image) {
  // create the element
  const canvas = $('#selector');
  const ctx = canvas.getContext('2d');

  // set the canvas size
  canvas.style.width = (dropWidth = canvas.width = ctx.canvas.width = image.naturalWidth) + 'px';
  canvas.style.height = (dropHeight = canvas.height = ctx.canvas.height = image.naturalHeight) + 'px';

  // draw the image
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, image.naturalWidth, image.naturalHeight);
  pixels = imageData.data;

  $('.instructions').style.display = 'none';
}

function addBtn() {
  const elem = document.createElement('div');
  elem.className = 'add button';
  elem.innerText = '+';
  return elem;
}

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
      description: $('#palette > .add').getAttribute('description') || 'Built with palette creator',
      // populate columns
      groups: $$('.group').map((c, columnIndex) => {
        // convert colors to linear rgb from whatever format is thrown in
        return {
          name: c.getAttribute('name') || ('Group ' + (columnIndex + 1)),
          colors: $$('.color', c).map(e => {
            // a technique so cursed you will shit the bed (pulling rgb from hex)
            let [sR, sG, sB] = e.style.backgroundColor.match(/[\d\.]+/g).map(Number);

            // convert to hex
            const hex = [sR, sG, sB].map(i =>
              i.toString(16).padStart(2, '0')).join('');
            used.push(hex);

            // convert sRGB to linear rgb
            const [r, g, b]  = linearRGB([sR, sG, sB]);
            return {r, g, b, a: 255};
          })
        };
      }),
    },
  };
  localStorage.temp = JSON.stringify(data.data);
  return data;
}

function initPalette(data) {
  if (!data) {
    data = {
      description: 'Built with palette creator',
      groups: [],
    }
  }

  const palette = $('#palette');
  palette.innerHTML = '';

  // handle all click events through the parent due to the nature of the undo/redo
  $('#palette').onclick = e => {
    const elem = e.target;

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
