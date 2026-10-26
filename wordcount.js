'use strict';

const input = document.querySelector('#text-input');
const clearButton = document.querySelector('#clear-button');
const number = new Intl.NumberFormat('bn-BD');
const wordSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('bn', { granularity: 'word' }) : null;
const characterSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('bn', { granularity: 'grapheme' }) : null;

function countWords(text) {
  if (wordSegmenter) return [...wordSegmenter.segment(text)].filter(segment => segment.isWordLike).length;
  return (text.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}\u200c\u200d'’-]*/gu) || []).length;
}

function countCharacters(text) {
  const characters = characterSegmenter ? [...characterSegmenter.segment(text)].map(part => part.segment) : Array.from(text);
  return { all: characters.length, withoutSpaces: characters.filter(character => !/^\s+$/u.test(character)).length };
}

function countSentences(text) {
  if (!text.trim()) return 0;
  return (text.match(/[^.!?।॥]+[.!?।॥]*/gu) || []).filter(part => part.trim()).length;
}

function countParagraphs(text) {
  if (!text.trim()) return 0;
  return text.trim().split(/\n\s*\n+/u).filter(part => part.trim()).length;
}

function readingTime(words) {
  if (!words) return '০ সেকেন্ড';
  const seconds = Math.ceil(words * 60 / 200);
  if (seconds < 60) return `${number.format(seconds)} সেকেন্ড`;
  return `${number.format(Math.ceil(seconds / 60))} মিনিট`;
}

function update() {
  const text = input.value;
  const words = countWords(text);
  const characters = countCharacters(text);
  document.querySelector('#word-count').textContent = number.format(words);
  document.querySelector('#character-count').textContent = number.format(characters.all);
  document.querySelector('#character-no-space').textContent = number.format(characters.withoutSpaces);
  document.querySelector('#sentence-count').textContent = number.format(countSentences(text));
  document.querySelector('#paragraph-count').textContent = number.format(countParagraphs(text));
  document.querySelector('#reading-time').textContent = readingTime(words);
}

input.addEventListener('input', update);
clearButton.addEventListener('click', () => { input.value = ''; update(); input.focus(); });
update();
