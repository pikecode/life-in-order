import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import DocumentOutline from '../src/app/library/document-outline';
import {documentHeadings} from '../src/app/library/markdown';
test('长文目录沿用正文标题锚点，无小节时不留空目录',()=>{
 const headings=documentHeadings('# 标题\n\n## 第一节\n内容\n\n## 第一节\n后文').filter(heading=>heading.depth===2);
 assert.deepEqual(headings.map(heading=>heading.id),['第一节','第一节-1']);
 const html=renderToStaticMarkup(createElement(DocumentOutline,{headings}));
 for(const heading of headings)assert.ok(html.includes(`href="#${heading.id}"`));
 assert.equal(renderToStaticMarkup(createElement(DocumentOutline,{headings:[]})),'');
});
