"""Independent fontTools ink/advance/head and SVG affine reference, never browser/product output."""
import argparse,hashlib,json,math,re,xml.etree.ElementTree as ET
from pathlib import Path
from functools import lru_cache
from PIL import ImageFont
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.svgLib.path import parse_path
parser=argparse.ArgumentParser();parser.add_argument('--fixtures',default='fixtures');parser.add_argument('--output',default='fixtures');args=parser.parse_args();fixture_dir=Path(args.fixtures);output_dir=Path(args.output);output_dir.mkdir(parents=True,exist_ok=True)
FONT=Path('assets/DejaVuSans.ttf');font=TTFont(FONT);cmap=font.getBestCmap();glyphset=font.getGlyphSet();upem=font['head'].unitsPerEm
I=(1,0,0,1,0,0)
def mul(a,b):
    aa,ab,ac,ad,ae,af=a;ba,bb,bc,bd,be,bf=b
    return (aa*ba+ac*bb,ab*ba+ad*bb,aa*bc+ac*bd,ab*bc+ad*bd,aa*be+ac*bf+ae,ab*be+ad*bf+af)
def transform(raw):
    result=I
    for name,params in re.findall(r'(\w+)\(([^)]*)\)',raw):
        n=[float(x) for x in re.findall(r'[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?',params)]
        if name=='translate':m=(1,0,0,1,n[0],n[1] if len(n)>1 else 0)
        elif name=='scale':m=(n[0],0,0,n[1] if len(n)>1 else n[0],0,0)
        elif name=='rotate':
            r=math.radians(n[0]);m=(math.cos(r),math.sin(r),-math.sin(r),math.cos(r),0,0)
            if len(n)==3:m=mul(mul((1,0,0,1,n[1],n[2]),m),(1,0,0,1,-n[1],-n[2]))
        elif name=='matrix':m=tuple(n)
        elif name=='skewX':m=(1,0,math.tan(math.radians(n[0])),1,0,0)
        else:raise ValueError(name)
        result=mul(result,m)
    return result
def corners(box,m):
    x0,y0,x1,y1=box;a,b,c,d,e,f=m
    return [[a*x+c*y+e,b*x+d*y+f] for x,y in [(x0,y0),(x1,y0),(x0,y1),(x1,y1)]]
def aabb(points):return [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
def text_bounds(text,size,x,y,anchor,kerning=None):
    advance=0;inks=[]
    previous = None
    for char in text:
        glyph=cmap[ord(char)]
        if kerning is not None:
            advance += kerning.get((previous, glyph), 0)
        previous = glyph
        pen=BoundsPen(glyphset);glyphset[glyph].draw(pen)
        if pen.bounds:
            x0,y0,x1,y1=pen.bounds;inks.append((x0+advance,y0,x1+advance,y1))
        advance+=font['hmtx'][glyph][0]
    left=min(v[0] for v in inks);right=max(v[2] for v in inks);bottom=min(v[1] for v in inks);top=max(v[3] for v in inks)
    k=size/upem;shift={'start':0,'middle':advance/2,'end':advance}[anchor];origin=x-shift*k
    ink=(origin+left*k,y-top*k,origin+right*k,y-bottom*k)
    envelope=(origin+min(0,left)*k,y-font['head'].yMax*k,origin+max(advance,right)*k,y-font['head'].yMin*k)
    return ink,envelope,[origin,origin+advance*k],[origin+advance*k*.5,y-size*.3]
@lru_cache
def hinted_metrics(text, pixel_size):
    face = ImageFont.truetype(FONT, pixel_size, layout_engine=ImageFont.Layout.BASIC)
    advance = face.getlength(text)
    mask, offset = face.getmask2(text, mode='L', anchor='ls')
    painted = mask.getbbox()
    if painted is None:
        return advance, (0, 0, 0, 0)
    left, top, right, bottom = painted
    return advance, (left + offset[0], top + offset[1], right + offset[0], bottom + offset[1])

def projected_text_bounds(ink, envelope, matrix):
    outer = aabb(corners(envelope, matrix))
    aligned = abs(matrix[1]) + abs(matrix[2]) < 1e-8
    return {'inkAabb': aabb(corners(ink, matrix)), 'envelopeAabb': outer,
            'layoutPx': [outer[0], outer[2]] if aligned else None}

def chromium_bounds(record, placement, matrix):
    # Linux Blink grid-fits advances in CSS layout pixels. DPR and preview
    # fit affect compositing, after the run has been laid out.
    x, y, anchor = placement
    scale = math.hypot(matrix[0], matrix[1])
    advance, (left, top, right, bottom) = hinted_metrics(record['text'], record['q'] * scale)
    origin = x - {'start': 0, 'middle': .5, 'end': 1}[anchor] * advance / scale
    ink = (origin + left / scale, y + top / scale, origin + right / scale, y + bottom / scale)
    envelope = (origin + min(0, left) / scale, record['envelope'][1],
                origin + max(advance, right) / scale, record['envelope'][3])
    return projected_text_bounds(ink, envelope, matrix)

def firefox_bounds(record, placement, matrix, group_sizes):
    # Gecko lays out a text frame at a clamped size before mapping to SVG.
    # SVGTextFrame::UpdateFontSizeScaleFactor / TextRenderedRun::GetRunUserSpaceRect
    # in Firefox 146 define the scale and the frame ink overflow respectively.
    scale = math.hypot(matrix[0], matrix[1])
    lower, upper = 8 / min(group_sizes), 200 / max(group_sizes)
    if lower <= upper:
        font_scale = min(max(scale, lower), upper)
    elif scale <= upper:
        font_scale = upper
    elif scale >= lower:
        font_scale = lower
    else:
        font_scale = scale
    hinted_advance, (left, _, right, _) = hinted_metrics(record['text'], record['q'] * font_scale)
    ink, envelope, (start, end), _ = text_bounds(record['text'], record['q'], *placement,
                                                 kerning=font['kern'].kernTables[0].kernTable)
    # The loose run bounds include overhanging glyphs. Gecko also includes
    # the containing frame's ink overflow around the resulting SVG box.
    outer = (start + 2 * min(0, left) / font_scale, envelope[1],
             end + 2 * max(0, right - hinted_advance) / font_scale, envelope[3])
    return projected_text_bounds(ink, outer, matrix)

def reference(path):
    root=ET.parse(path).getroot();vb=[float(v) for v in root.get('viewBox').split()];width=float(root.get('width').removesuffix('pt'));height=float(root.get('height').removesuffix('pt'));records=[];placement={};text_groups={};group_sizes={};ordinal=0
    def visit(el,parent,styles,gid,sourcepath,in_definition=False,text_group=None):
        nonlocal ordinal
        oid='o'+str(ordinal);ordinal+=1;tag=el.tag.split('}')[-1];m=parent if el is root else mul(parent,transform(el.get('transform','')));s={**styles,**dict(p.split(':',1) for p in el.get('style','').split(';') if ':' in p)};s={k.strip():v.strip() for k,v in s.items()};s.update({k:v for k,v in el.attrib.items() if k in ['font-size','text-anchor','font-family','stroke-width','stroke']});gid=el.get('id',gid)
        if tag == 'text':
            text_group = oid
        if tag in ('text','tspan') and el.text and el.text.strip():
            raw=s.get('font-size') or re.search(r'[\d.]+(?:px|pt|mm)',s['font'])[0];q=float(re.match(r'[\d.]+',raw)[0])*({'pt':96/72,'mm':96/25.4}.get(raw[-2:],1));x=float(el.get('x','0'));y=float(el.get('y','0'));ink,env,advance,click=text_bounds(el.text,q,x,y,s.get('text-anchor','start'))
            placement[oid] = (x, y, s.get('text-anchor', 'start'))
            text_groups[oid] = text_group
            group_sizes.setdefault(text_group, []).append(q)
            records.append({'objectId':oid,'sourcePath':sourcepath,'gid':gid,'kind':'text','q':q,'matrix':m,'ink':ink,'envelope':env,'advance':advance,'click':click,'text':el.text})
        if tag=='path' and s.get('stroke','none')!='none' and 'd' in el.attrib:
            pen=BoundsPen(None);parse_path(el.get('d'),pen)
            if pen.bounds:records.append({'objectId':oid,'sourcePath':sourcepath,'gid':gid,'kind':'stroke','q':float(s.get('stroke-width','1')),'matrix':m,'box':list(pen.bounds)})
        for record in records:
            if record['objectId']==oid:record['expectedStatus']='excluded' if in_definition else 'measured'
        for i,child in enumerate(el):visit(child,m,s,gid,sourcepath+'/'+str(i),in_definition or tag in ('defs','clipPath'),text_group)
    visit(root,I,{},None,'/0')
    # ET keeps metadata elements but ignores comments, same ordinal contract as source XML.
    cases=[]
    requests=[(width,t) for width in ([85] if path.name.startswith(('01','02')) else [50.8,25.4]) for t in (['','scale(2)','translate(10 7)','rotate(20 96 48)'] if path.name.startswith(('03','06')) else [''])]
    for final_width,root_t in requests:
        w=final_width*96/25.4;h=w*height/width;scale=min(w/vb[2],h/vb[3]);v=(scale,0,0,scale,-vb[0]*scale+(w-vb[2]*scale)/2,-vb[1]*scale+(h-vb[3]*scale)/2)
        transformed=[]
        for r in records:
            m=mul(mul(transform(root_t or root.get('transform','')),v),r['matrix']);q=r['q'];s=math.hypot(m[0],m[1]);item={**r,'finalPt':q*s*.75}
            boxes=['ink','envelope'] if r['kind']=='text' else ['box']
            for box in boxes:
                points=corners(r[box],m);item[box+'Corners']=points;item[box+'Aabb']=aabb(points)
            if r['kind']=='text':
                x,y=r['click'];item['clickPx']=[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]
                item['advancePx']=[m[0]*x+m[4] for x in r['advance']] if abs(m[1])+abs(m[2])<1e-8 else None
                oid = r['objectId']
                item['gridFitted'] = chromium_bounds(r, placement[oid], m)
                fractional = firefox_bounds(r, placement[oid], m, group_sizes[text_groups[oid]])
                outline = {'inkAabb': item['inkAabb'], 'envelopeAabb': item['envelopeAabb'], 'layoutPx': item['advancePx']}
                if fractional != outline:
                    item['fractional'] = fractional
            transformed.append(item)
        cases.append({'widthMm':final_width,'widthPx':w,'heightPx':h,'rootTransform':root_t,'records':transformed})
    return {'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'viewBox':vb,'rootPt':[width,height],'cases':cases}
out={'fontSha256':hashlib.sha256(FONT.read_bytes()).hexdigest(),'fontVersion':'2.35','basis':'fontTools cmap/hmtx/head + glyph BoundsPen; independent affine code','files':{}}
for p in sorted(fixture_dir.glob('*.svg')):
    n=int(p.name[:2])
    if n in (1,2,3,4,5,6,7,8,9,10) or n>=21:out['files'][p.name]=reference(p)
(output_dir/'text-reference.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8',newline='\n')
files=sorted(fixture_dir.glob('*.svg'));measurement_ids=['01']+[str(i) for i in range(21,40)]
entries=[]
for p in files:
    ident=p.name[:2];is_m=ident in measurement_ids
    parse={'18':'rejected','19':'limited','20':'invalid'}.get(ident,'accepted')
    entries.append({'id':ident,'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'themeIds':[ident] if int(ident)<=20 else [],'measurementAcceptanceIds':[ident] if is_m else [],'expectedParse':parse,'expectedPreview':'enabled' if parse=='accepted' else None,'expectedRun':'complete' if parse=='accepted' else None,'textScope':'direct retained text/tspan; outlined glyph text remains unknown','strokeScope':'visible direct geometry and direct text stroke; defs excluded and use unassessed','truthSource':'text-reference.json#files/'+p.name if p.name in out['files'] else 'generator parameters; counterexample coverage only','injectedProblems':{'SMALL_TEXT':3,'THIN_STROKE':1} if ident=='01' else {'SMALL_TEXT':1,'THIN_STROKE':1} if is_m else None,'manualInspection':{'record':'manual-inspection.json#'+ident}})
manifest={'schemaVersion':1,'actualFileCount':len(files),'actualThemeCount':len([p for p in files if int(p.name[:2])<=20]),'plannedThemeCount':20,'themeIds':[f'{i:02}' for i in range(1,21)],'measurementAcceptanceIds':measurement_ids,'measurementAcceptanceCount':len(measurement_ids),'entries':entries,'pendingThemes':[],'parameterizedSafetyVariants':'tests/input.browser.spec.ts and tests/input-review.browser.spec.ts and tests/render-budget.browser.spec.ts and tests/performance-cases.ts; separate from file and M counts'}
(output_dir/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'files':len(out['files']),'fontSha256':out['fontSha256']}))
