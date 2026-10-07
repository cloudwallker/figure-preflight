import {inflateSync} from 'node:zlib';
/** Independent test decoder for 8-bit RGBA/RGB PNG pixels (no browser re-encoding). */
export function pngPixels(png:Buffer){
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20),channels=png[25]===6?4:3;if(png[24]!==8||![2,6].includes(png[25]))throw Error('Unsupported test PNG');let position=8;const parts:Buffer[]=[];
 while(position<png.length){const length=png.readUInt32BE(position),type=png.toString('ascii',position+4,position+8);if(type==='IDAT')parts.push(png.subarray(position+8,position+8+length));position+=length+12;}
 const packed=inflateSync(Buffer.concat(parts)),stride=width*channels,pixels=new Uint8Array(stride*height);let input=0;
 for(let y=0;y<height;y++){const filter=packed[input++];for(let x=0;x<stride;x++){const pos=y*stride+x,a=x>=channels?pixels[pos-channels]:0,b=y?pixels[pos-stride]:0,c=y&&x>=channels?pixels[pos-stride-channels]:0;let predictor=0;if(filter===1)predictor=a;if(filter===2)predictor=b;if(filter===3)predictor=Math.floor((a+b)/2);if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);predictor=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}pixels[pos]=(packed[input++]+predictor)&255;}}
 return {width,height,at:(x:number,y:number)=>{const p=(y*width+x)*channels;return [pixels[p],pixels[p+1],pixels[p+2],channels===4?pixels[p+3]:255];}};
}
