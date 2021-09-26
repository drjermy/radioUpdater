handle();

function handle()
{
  // updateArticleView();
  updateArticleEdit();
}

function updateArticleView()
{
  let referenceBlock = document.getElementById('references');

  if (referenceBlock !== null) {
    let refs = referenceBlock.getElementsByTagName('li');

    // iterateReferences(refs)
  }
}

function updateArticleEdit()
{
  let editReferenceBlock = document.getElementsByClassName('references');

  if (editReferenceBlock !== null) {
    let links = document.querySelectorAll('[data-citeitright]');

    iterateLinks(links)

    let refs = editReferenceBlock[0].getElementsByTagName('textarea');

    iterateEditableReferences(refs);
  }
}


function iterateReferences(refs)
{
  for(let i = 0; i < refs.length; i++) {

    // checkReference(refs[i]);

  }
}

function iterateLinks(links)
{
  for(let i = 0; i < links.length; i++) {

    overwriteClick(links[i]);

  }
}

function iterateEditableReferences(refs)
{
  for(let i = 0; i < refs.length; i++) {
    preloadReference(refs[i]);
  }
}



function checkReference(ref)
{
  let htmlReference = ref.innerHTML;

  chrome.runtime.sendMessage({msg: htmlReference}, function({data}){

    if (data.match) {
      ref.style.color = "green";
    } else {
      ref.style.color = "red";

      let referenceBlock = document.getElementById('references');
      let heading = referenceBlock.getElementsByClassName('expandable-heading');
      heading[0].style.color = "red";
    }

  });
}

function overwriteClick(link)
{
  link.addEventListener("click", function(event) {

      event.preventDefault()

      if (hasSavedReference(this)) {

        undoReference(this)

      } else {

        updateReference(this)

      }

    });

}

function preloadReference(ref)
{
  initialReference = ref.innerHTML;
  if (!initialReference) {
    return;
  }

  chrome.runtime.sendMessage({msg: initialReference}, function({data}){

    if (data.match) {
      ref.style.color = "green";
    } else {
      ref.style.color = "red";
    }

    let preReference = '';
    if (data.index) {
      preReference = data.index + '. ' + data.citation;
    } else {
      preReference = data.citation;
    }

    let parent = ref.parentNode;

    let preRefBlock = document.createElement("p");
    let refNode = document.createTextNode(preReference);

    preRefBlock.appendChild(refNode);
    preRefBlock.classList.add('preRef');
    preRefBlock.classList.add('hidden');

    parent.appendChild(preRefBlock);

  });

}

function hasSavedReference(that)
{
  let parent = that.parentNode;

  let previousReference = parent.getElementsByClassName('oldRef');

  return previousReference.length > 0;
}

function updateReference(that)
{
  let parent = that.parentNode;
  let textarea = parent.getElementsByTagName('textarea');
  let htmlReference = textarea[0].innerHTML;

  textarea[0].parentNode.appendChild(hiddenReference(htmlReference));

  let preReference = parent.getElementsByClassName('preRef');

  if (preReference.length > 0) {

    textarea[0].innerHTML = preReference[0].innerHTML;
    textarea[0].style.color = 'green';
    that.innerHTML = 'Undo'

  } else {

    that.innerHTML = 'Formatting'

    chrome.runtime.sendMessage({msg: htmlReference}, function({data}){

      if (data.index) {
        textarea[0].innerHTML = data.index + '. ' + data.citation;
      } else {
        textarea[0].innerHTML = data.citation;
      }

      that.innerHTML = 'Undo'

    });

  }

}

function undoReference(that)
{
  let parent = that.parentNode;
  let previousReference = parent.getElementsByClassName('oldRef');
  let textarea = parent.getElementsByTagName('textarea');

  textarea[0].innerHTML = decodeHTML(previousReference[0].innerHTML);
  textarea[0].style.color = 'red';

  previousReference[0].remove();

  that.innerHTML = 'Format citation'
}

function hiddenReference(htmlReference)
{
  let oldRefBlock = document.createElement("p");
  let refNode = document.createTextNode(htmlReference);

  oldRefBlock.appendChild(refNode);
  oldRefBlock.classList.add('oldRef');
  oldRefBlock.classList.add('hidden');

  return oldRefBlock;
}

var decodeHTML = function (html) {
  var txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
};
