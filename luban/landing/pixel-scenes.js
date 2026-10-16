/* Original, deterministic low-resolution game scenes. No external image assets. */
(() => {
 const world=document.body.dataset.world;
 const palettes={moss:['#112c32','#244a47','#3c6b56','#64a66e','#acc681','#d6e9a4'],neon:['#17102c','#2b204d','#4c3266','#af559e','#66e2eb','#f994cd'],ocean:['#092139','#103f56','#1b626c','#449392','#84c5ac','#d7d89d'],ember:['#2d1525','#542539','#843f42','#bc6045','#f89b57','#ffe6a0'],lunar:['#101a31','#253451','#45516e','#78859a','#abbcc5','#e3edf0']};
 const p=palettes[world]||palettes.moss;
 function draw(canvas){
  const scene=canvas.dataset.scene;const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const W=480,H=Math.round(W*rect.height/rect.width);canvas.width=W;canvas.height=H;
  const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  let state=({hero:7351,journey:2154,abilities:4892,guide:9821,final:6472}[scene]||1)+(Object.keys(palettes).indexOf(world)*563);
  function rnd(){state=(state*1664525+1013904223)>>>0;return state/4294967296;}
  function box(x,y,w,h,col){c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
  function poly(points,col){c.fillStyle=col;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(Math.round(x),Math.round(y)):c.moveTo(Math.round(x),Math.round(y)));c.closePath();c.fill();}
  function star(x,y,col,s=1){box(x,y,s*3,s,col);box(x+s,y-s,s,s*3,col);}
  const horizon=H*.62, ground=H*.86;
  box(0,0,W,H,p[0]);
  // Layered sky bands, stars, and stepped clouds.
  for(let y=0;y<H*.7;y+=4)box(0,y,W,4,y>H*.43?p[1]:p[0]);
  for(let i=0;i<100;i++){let x=rnd()*W,y=rnd()*H*.65;if(rnd()>.8)star(x,y,p[4]);else box(x,y,1,1,p[2]);}
  const sunX=world==='neon'?370:world==='ocean'?400:world==='ember'?385:world==='lunar'?365:350;
  const sunY=H*.27,sunR=world==='lunar'?28:world==='neon'?30:19;
  for(let yy=-sunR;yy<=sunR;yy+=2){let half=Math.floor(Math.sqrt(sunR*sunR-yy*yy)/2)*2;box(sunX-half,sunY+yy,half*2,2,p[world==='ember'?4:5]);}
  if(world==='neon')for(let y=0;y<35;y+=5)box(sunX-35,sunY+y,70,2,p[0]);
  if(world==='lunar'){for(let i=0;i<16;i++){let x=sunX+(rnd()-.5)*38,y=sunY+(rnd()-.5)*38;box(x,y,3+rnd()*5,2+rnd()*3,p[3]);}box(sunX-35,sunY+5,76,2,p[3]);box(sunX-39,sunY+9,84,2,p[2]);}
  for(let j=0;j<3;j++){
   let pts=[[0,H]];for(let x=0;x<=W;x+=8){let y=horizon-(3-j)*13-Math.sin(x*.025+j*3)*13-rnd()*7;pts.push([x,y],[x+8,y]);}pts.push([W,H]);poly(pts,p[j+1]);
  }
  function pine(x,y,s){box(x-1*s,y,3*s,16*s,p[1]);for(let j=0;j<4;j++){let k=(4-j)*4*s;box(x-k,y-12*s+j*6*s,k*2,4*s,p[2]);box(x-k+2*s,y-14*s+j*6*s,k*2-4*s,2*s,p[3]);}box(x-3*s,y+15*s,7*s,2*s,p[0]);}
  function stone(x,y,w,h){box(x,y,w,h,p[1]);box(x,y,w,2,p[3]);box(x,y,2,h,p[2]);for(let yy=y+5;yy<y+h;yy+=6){box(x,yy,w,1,p[0]);for(let xx=x+((yy-y)%12?4:0);xx<x+w;xx+=10)box(xx,yy-5,1,5,p[0]);}}
  function windowAt(x,y,col){box(x,y,4,7,col);box(x+1,y+1,1,5,p[5]);}
  function chest(x,y){box(x-1,y+2,16,10,'#5b3c38');box(x,y,14,5,'#c99c56');box(x,y+5,14,2,'#edce7f');box(x+6,y+4,3,5,'#fff2a0');box(x+1,y+10,12,2,p[0]);}
  function crystal(x,y,col){poly([[x,y-12],[x+5,y-5],[x+3,y+5],[x-4,y+5],[x-6,y-3]],col);box(x-1,y-8,2,9,p[5]);}
  if(world==='moss'){
   for(let i=0;i<24;i++)pine(i*24+rnd()*10,horizon+15+rnd()*19,1+rnd());
   // Hilltop castle and a warm little cottage.
   stone(333,horizon-42,68,55);stone(324,horizon-60,18,73);stone(391,horizon-66,20,80);
   for(let x=324;x<411;x+=7)box(x,horizon-67,4,6,p[3]);
   poly([[323,horizon-60],[333,horizon-77],[344,horizon-60]],p[1]);poly([[389,horizon-66],[401,horizon-86],[413,horizon-66]],p[1]);
   box(331,horizon-88,1,13,p[4]);box(332,horizon-87,12,6,p[4]);
   windowAt(357,horizon-33,p[5]);windowAt(374,horizon-33,p[5]);box(361,horizon-7,12,20,p[0]);
   poly([[260,ground-16],[274,ground-37],[292,ground-16]],'#764b45');box(265,ground-16,24,18,'#c9b384');box(274,ground-8,6,10,p[0]);windowAt(281,ground-12,'#f4d889');
   poly([[361,horizon+10],[373,horizon+10],[430,H],[359,H]],'#7c9470');
  }else if(world==='neon'){
   for(let layer=0;layer<2;layer++)for(let x=0;x<W;x+=14+Math.floor(rnd()*20)){let w=12+rnd()*20,h=25+rnd()*65,y=ground-h;box(x,y,w,h,p[layer+1]);box(x+2,y-3,w-4,3,p[2]);for(let yy=y+7;yy<ground-5;yy+=8)for(let xx=x+3;xx<x+w-2;xx+=5)if(rnd()>.35)box(xx,yy,2,3,rnd()>.4?p[4]:p[3]);if(rnd()>.6){box(x+3,y-14,1,14,p[3]);star(x+3,y-15,p[4]);}}
   box(338,ground-90,35,90,p[1]);box(341,ground-87,29,4,p[3]);box(350,ground-112,12,22,p[1]);box(355,ground-132,2,20,p[4]);
   box(343,ground-75,25,27,p[3]);box(346,ground-72,19,21,p[0]);for(let k=0;k<4;k++)box(350+k*4,ground-67,2,12,p[4]);
   for(let y=ground;y<H;y+=7)box(0,y,W,1,p[3]);for(let x=20;x<W;x+=45)poly([[240,ground],[x,H],[x+1,H]],p[2]);
   box(290,ground-9,36,8,p[3]);box(296,ground-14,20,6,p[4]);box(294,ground-2,7,4,p[0]);box(316,ground-2,7,4,p[0]);
  }else if(world==='ocean'){
   for(let i=0;i<9;i++){let x=170+i*35;poly([[x,0],[x+8,0],[x+65,H],[x+22,H]],'#81bdba0c');}
   stone(299,horizon-17,125,10);for(let x=310;x<420;x+=27){stone(x,horizon-13,9,68);box(x-3,horizon-17,15,5,p[4]);box(x-2,horizon+50,13,6,p[3]);}poly([[291,horizon-18],[362,horizon-48],[433,horizon-18]],p[3]);poly([[314,horizon-24],[362,horizon-43],[410,horizon-24]],p[2]);star(361,horizon-30,p[5],2);
   for(let i=0;i<28;i++){let x=rnd()*W,y=ground+rnd()*20;let col=rnd()>.5?'#b87996':'#83b896';box(x,y-9,2,14,col);box(x-4,y-7,6,2,col);box(x+1,y-11,5,2,col);box(x+4,y-16,2,7,col);}
   for(let i=0;i<24;i++){let x=rnd()*W,y=rnd()*H*.85;box(x,y,2,1,p[4]);box(x-1,y+1,1,2,p[4]);box(x+2,y+1,1,2,p[2]);}
   for(let i=0;i<12;i++){let x=rnd()*W,y=H*.3+rnd()*H*.5;box(x,y,6,2,p[4]);box(x+6,y-1,2,4,p[4]);box(x+1,y,1,1,p[0]);}
  }else if(world==='ember'){
   poly([[260,ground],[340,horizon-80],[420,ground]],p[1]);poly([[325,horizon-53],[340,horizon-80],[356,horizon-48],[347,horizon-52],[340,horizon-44]],p[4]);
   for(let i=0;i<34;i++){let x=335+(rnd()-.5)*70,y=horizon-95-rnd()*80;box(x,y,2,2,rnd()>.5?p[4]:p[3]);}
   stone(348,horizon-25,89,70);for(let x=343;x<440;x+=37){stone(x,horizon-46,19,91);for(let k=0;k<3;k++)box(x+k*7,horizon-52,4,7,p[3]);windowAt(x+7,horizon-30,p[4]);}box(383,horizon+7,16,38,p[0]);box(385,horizon+11,12,31,p[4]);box(388,horizon+15,6,27,p[0]);
   poly([[280,ground],[314,ground],[371,H],[270,H]],p[3]);poly([[292,ground],[299,ground],[335,H],[292,H]],p[4]);for(let i=0;i<30;i++)box(290+rnd()*35,ground+rnd()*(H-ground),4,1,p[5]);
   for(let i=0;i<16;i++){let x=rnd()*W,y=ground+rnd()*30;crystal(x,y,p[3]);}
  }else{
   for(let i=0;i<22;i++){let x=rnd()*W,y=horizon+rnd()*H*.35;box(x,y,10+rnd()*20,2,p[2]);box(x+3,y+2,8+rnd()*10,2,p[0]);}
   const baseX=315,baseY=ground-23;
   for(let yy=-25;yy<=0;yy+=2){let half=Math.floor(Math.sqrt(25*25-yy*yy));box(baseX-half,baseY+yy,half*2,2,p[3]);box(baseX-half+4,baseY+yy,Math.max(0,half*2-8),1,p[4]);}box(baseX-27,baseY,54,16,p[2]);box(baseX-22,baseY+3,44,4,p[5]);for(let x=baseX-20;x<baseX+20;x+=7)box(x,baseY+3,3,4,p[1]);box(baseX+25,baseY+5,40,4,p[3]);stone(baseX+62,baseY-10,24,35);box(baseX+67,baseY-7,13,10,p[4]);
   box(409,ground-61,12,58,p[4]);poly([[409,ground-61],[415,ground-75],[421,ground-61]],p[5]);box(412,ground-53,6,7,p[1]);poly([[409,ground-15],[402,ground-5],[409,ground-5]],p[3]);poly([[421,ground-15],[428,ground-5],[421,ground-5]],p[3]);
   box(270,ground-34,2,33,p[5]);box(272,ground-34,18,10,p[4]);box(275,ground-31,6,4,p[1]);
   box(365,ground+5,18,7,p[4]);box(369,ground,9,6,p[3]);box(367,ground+11,4,4,p[0]);box(378,ground+11,4,4,p[0]);
  }
  // Foreground platform, textured earth, stepped cliffs and rewards.
  if(world!=='neon'){
   for(let x=0;x<W;x+=8){let y=ground+Math.floor(rnd()*3)*2;box(x,y,8,H-y,p[0]);box(x,y,8,3,p[3]);box(x,y+3,8,3,p[2]);for(let yy=y+8;yy<H;yy+=7)if(rnd()>.25)box(x+Math.floor(rnd()*5),yy,2,2,p[1]);}
   for(let i=0;i<18;i++){let x=rnd()*W,y=ground-1;box(x,y-3,1,4,p[4]);box(x-2,y-2,2,1,p[3]);}
  }
  if(scene==='abilities'||scene==='final'){chest(360,ground-13);for(let x=385;x<425;x+=13)crystal(x,ground-10,p[4]);}
  if(scene==='guide'){stone(348,ground-22,25,22);box(354,ground-36,13,13,p[4]);box(352,ground-25,17,18,p[3]);box(360,ground-32,2,2,p[0]);box(365,ground-32,2,2,p[0]);box(374,ground-35,2,36,p[5]);star(374,ground-40,p[4],2);}
  // Hero adventurer: a little luminous companion on the path.
  let ax=world==='neon'?276:world==='lunar'?246:310,ay=ground-17;
  box(ax+3,ay,6,5,p[5]);box(ax+1,ay+5,10,3,p[4]);box(ax+3,ay+8,6,6,p[3]);box(ax+2,ay+14,3,4,p[0]);box(ax+7,ay+14,3,4,p[0]);box(ax+7,ay+2,2,1,p[0]);
  for(let i=0;i<12;i++)star(250+rnd()*210,H*.5+rnd()*H*.35,p[4]);
 }
 let timer;const redraw=()=>document.querySelectorAll('.scene-canvas').forEach(draw);
 redraw();window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(redraw,120);});
})();
