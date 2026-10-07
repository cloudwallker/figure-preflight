export const wrap=(body:string,viewBox='0 0 144 72')=>`<svg xmlns="http://www.w3.org/2000/svg" width="144pt" height="72pt" viewBox="${viewBox}">${body}</svg>`;
export type Pressure={name:string;xml:string;widthMm:number;expected:'accepted'|'limited';cancel?:boolean;texture?:boolean};
export function pressureCases():Pressure[]{
 const result:Pressure[]=[];
 const curves=(n:number)=>Array.from({length:n},(_,i)=>'C'+[i%10,(i+1)%10,(i*3)%10,(i*7)%10,(i+5)%10,(i+9)%10].join(' ')).join('');
 const add=(name:string,body:string,expected:'accepted'|'limited'='accepted')=>result.push({name,xml:wrap(body),widthMm:50.8,expected});
 for(const over of [0,1]){
  const suffix=over?'-plus-one':'-equal',status=over?'limited':'accepted';
  const bytes=10485760+over;add('bytes'+suffix,'<!--'+' '.repeat(bytes-wrap('<!---->').length)+'-->',status);
  add('elements'+suffix,'<g/>'.repeat(19999+over),status);
  add('depth'+suffix,'<g>'.repeat(63+over)+'<text font-size="8px">HIM</text>'+'</g>'.repeat(63+over),status); // adjusted below to include deepest text
  result.at(-1)!.xml=wrap('<g>'.repeat(62+over)+'<text font-size="8px">HIM</text>'+'</g>'.repeat(62+over));
  add('attribute'+suffix,'<g id="'+'a'.repeat(65536+over)+'"/>',status);
  add('path-bytes'+suffix,'<path stroke="black" stroke-width=".5" d="M0 0'+' '.repeat(2097152+over-4)+'"/>',status);
  add('commands'+suffix,'<path stroke="black" stroke-width=".5" fill="none" d="M0 0'+'C1 2 3 4 5 6'.repeat(99999+over)+'"/>',status);
  add('text'+suffix,'<text font-family="DejaVu Sans" font-size="8px">'+'H'.repeat(1048576+over)+'</text>',status);
  add('use'+suffix,'<defs><path id="p" d="M0 0L30 30" stroke="black"/></defs>'+'<use href="#p"/>'.repeat(5000+over),status);
 }
 add('combined-original','<defs><path id="p" d="M0 0L10 10" stroke="black"/></defs>'+'<use href="#p"/>'.repeat(5000)+'<path d="M0 0L1 1" stroke="black"/>'.repeat(14995)+'<text font-size="8px">'+'H'.repeat(1048576)+'</text>','limited');
 for(const r of result)if(/^(bytes|elements|text|path-bytes|commands|use)-equal$/.test(r.name))r.expected='limited';
 for(const over of [0,1]){const suffix=over?'-plus-one':'-equal',status=over?'limited':'accepted';
  add('current-bytes'+suffix,'<!--'+' '.repeat(2097152+over-wrap('<!---->').length)+'-->',status);
  add('current-elements'+suffix,'<g/>'.repeat(4095+over),status);
  add('current-text'+suffix,'<text font-family="DejaVu Sans" font-size="8px">'+'H'.repeat(131072+over)+'</text>',status);
  add('current-path-bytes'+suffix,'<path stroke="black" d="M0 0'+' '.repeat(524288+over-4)+'"/>',status);
  add('current-commands'+suffix,'<path stroke="black" d="M0 0'+curves(32767+over)+'"/>',status);
  add('current-use'+suffix,'<defs><path id="p" d="M0 0L10 10" stroke="black"/></defs>'+'<use href="#p"/>'.repeat(2000+over),status);
 }
 const commands='M0 0'+'C1 2 3 4 5 6'.repeat(100000-2-3187*2-1);
 add('combined-intermediate','<defs><path id="p" d="M0 0L10 10" stroke="black"/></defs>'+'<use href="#p"/>'.repeat(5000)+'<path d="M0 0L1 1" stroke="black"/>'.repeat(3187)+'<path stroke="black" d="'+commands+' '.repeat(2097152-commands.length)+'"/><text font-size="8px">'+'H'.repeat(262144)+'</text>','limited');
 const curveData='M0 0'+curves(32768-2-2029*2-1);
 const combo='<defs><path id="p" d="M0 0L10 10" stroke="black"/></defs>'+'<use href="#p"/>'.repeat(2000)+'<path d="M0 0L1 1" stroke="black"/>'.repeat(2029)+'<path stroke="black" d="'+curveData+' '.repeat(524288-curveData.length)+'"/><g id="'+'a'.repeat(65536)+'">'+'<g>'.repeat(61)+'<text font-family="DejaVu Sans" font-size="8px">'+'H'.repeat(131072)+'</text>'+'</g>'.repeat(62);
 add('combined-current',combo+'<!--'+' '.repeat(2097152-wrap(combo+'<!---->').length)+'-->');
 add('current-text-mixed-glyphs','<text font-family="DejaVu Sans" font-size="8px">'+('HIM中文Ω').repeat(Math.floor(131072/6))+'H'.repeat(131072%6)+'</text>');
 result.push({name:'extreme-viewbox',xml:wrap('<text font-size="8px">HIM</text>','0 0 1e100 1e-100'),widthMm:50.8,expected:'accepted'});
 result.push({name:'derived-height-over',xml:wrap('<text font-size="8px">HIM</text>').replace('height="72pt"','height="2000pt"'),widthMm:85,expected:'accepted'});
 for(const side of [2048,2049,2000,Math.sqrt(4000001)])result.push({name:'preview-dimension-'+side,xml:wrap('<rect width="144" height="144"/>','0 0 144 144').replace('height="72pt"','height="144pt"'),widthMm:side*25.4/96,expected:'accepted'});
 result.push({name:'four-textures',xml:wrap('<rect width="144" height="144" fill="#c33"/><text x="10" y="20" font-size="8px">HIM</text>','0 0 144 144').replace('height="72pt"','height="144pt"'),widthMm:500,expected:'accepted',texture:true});
 result.push({name:'cancel-and-reimport',xml:wrap('<text x="10" y="20" font-size="8px">HIM</text>'.repeat(4000)),widthMm:50.8,expected:'accepted',cancel:true});
 // Retain every historical input; the new producer stops these before paint.
 for(const row of result)if(['current-commands-equal','combined-current'].includes(row.name))row.expected='limited';
 result.find(r=>r.name==='cancel-and-reimport')!.cancel=false;
 result.push({name:'cancel-and-reimport-budgeted',xml:wrap('<text x="10" y="20" font-size="8px">HIM</text>'.repeat(4000)),widthMm:5,expected:'accepted',cancel:true});
 const sequence=(n:number)=>'<path stroke="black" fill="none" d="M0 0'+curves(n-1)+'"/>';
 for(const over of [0,1]){const suffix=over?'-plus-one':'-equal',expected=over?'limited':'accepted';
  add('render-single-sequence'+suffix,sequence(2048+over),expected);
  add('render-raw-commands'+suffix,sequence(2048)+sequence(2048)+(over?sequence(1):''),expected);
  add('render-expanded-use'+suffix,'<defs><path id="p" d="M0 0L1 1L2 2L3 3"/></defs>'+'<use href="#p"/>'.repeat(1024)+(over?sequence(1):''),expected);
  add('render-expanded-clip'+suffix,'<defs><clipPath id="c"><path d="M0 0L1 1L2 2"/></clipPath></defs>'+'<rect width="144" height="72" opacity=".5" clip-path="url(#c)"/>'.repeat(512)+(over?sequence(1):''),expected);
  add('render-polyline-sequence'+suffix,'<polyline points="'+'0 0 '.repeat(2048+over)+'"/>',expected);
  const h=1000+over;result.push({name:'render-pixel-work'+suffix,xml:`<svg xmlns="http://www.w3.org/2000/svg" width="1000px" height="${h}px" viewBox="0 0 1000 ${h}">`+'<rect width="1000" height="1001" fill="#c33" opacity=".5"/>'.repeat(64)+'</svg>',widthMm:1000*25.4/96,expected:'accepted',texture:!over});
 }
 result.push({name:'render-largest-dense-curves',xml:wrap(sequence(2048)+sequence(2048),'0 0 10 10').replace('height="72pt"','height="144pt"'),widthMm:500,expected:'accepted',texture:true});
 result.push({name:'render-long-text-small-viewport',xml:wrap('<text font-family="DejaVu Sans" font-size="8px">'+'H'.repeat(131072)+'</text>'),widthMm:2,expected:'accepted',texture:true});
 const unused='M0 0'+curves(34),admitted='<defs><path id="unused" d="'+unused+' '.repeat(524288-unused.length)+'"/></defs><g id="'+'a'.repeat(65536)+'"/>'+'<g opacity=".99">'.repeat(17)+sequence(2048)+sequence(2013)+'<rect width="10" height="10" opacity=".5" fill="#c33"/>'.repeat(7)+'</g>'.repeat(17)+'<g/>'.repeat(4066);
 const combined=wrap(admitted,'0 0 10 10').replace('height="72pt"','height="144pt"');result.push({name:'render-combined-admitted-bounds',xml:combined.replace('</svg>','<!--'+' '.repeat(2097152-combined.length-7)+'--></svg>'),widthMm:500,expected:'accepted',texture:true});
 // Keep the first candidate's inputs verbatim as now-limited counterexamples.
 for(const row of result)if(['current-use-equal','render-single-sequence-equal','render-raw-commands-equal','render-expanded-use-equal','render-expanded-clip-equal','render-polyline-sequence-equal','render-largest-dense-curves','render-combined-admitted-bounds'].includes(row.name)){row.expected='limited';row.texture=false;}
 for(const over of [0,1]){const suffix=over?'-plus-one':'-equal',expected=over?'limited':'accepted';
  add('render2-single-sequence'+suffix,sequence(1024+over),expected);
  add('render2-raw-commands'+suffix,'<defs>'+sequence(1024).repeat(4)+(over?sequence(1):'')+'</defs>',expected);
  add('render2-expanded-use'+suffix,'<defs><path id="p" d="M0 0L1 1L2 2L3 3"/></defs>'+'<use href="#p"/>'.repeat(512)+(over?sequence(1):''),expected);
  add('render2-expanded-clip'+suffix,'<defs><clipPath id="c"><path d="M0 0L1 1L2 2"/></clipPath></defs>'+'<rect width="144" height="72" opacity=".5" clip-path="url(#c)"/>'.repeat(256)+(over?sequence(1):''),expected);
  add('render2-polyline-sequence'+suffix,'<polyline points="'+'0 0 '.repeat(1024+over)+'"/>',expected);
  add('render2-polygon-sequence'+suffix,'<polygon points="'+'0 0 '.repeat(1023+over)+'"/>',expected);
  add('render2-use-instances'+suffix,'<defs><path id="p" d="M0 0"/></defs>'+'<use href="#p"/>'.repeat(2000+over),expected);
 }
 result.push({name:'render2-largest-dense-curves',xml:wrap(sequence(1024)+sequence(1024),'0 0 10 10').replace('height="72pt"','height="144pt"'),widthMm:500,expected:'accepted',texture:true});
 const unused2='M0 0'+curves(1023),admitted2='<defs><path id="unused" d="'+unused2+' '.repeat(524288-unused2.length)+'"/>'+sequence(1024)+sequence(35)+'</defs><g id="'+'a'.repeat(65536)+'"/>'+'<g opacity=".99">'.repeat(17)+sequence(1024)+sequence(989)+'<rect width="10" height="10" opacity=".5" fill="#c33"/>'.repeat(7)+'</g>'.repeat(17)+'<g/>'.repeat(4064);
 const combined2=wrap(admitted2,'0 0 10 10').replace('height="72pt"','height="144pt"');result.push({name:'render2-combined-admitted-bounds',xml:combined2.replace('</svg>','<!--'+' '.repeat(2097152-combined2.length-7)+'--></svg>'),widthMm:500,expected:'accepted',texture:true});
 return result;
}
