import subprocess
BG='#FBF6EA'; LINE='#8E8276'; FUR='#FFFDF8'; PEACH='#F8DCC8'; BLUSH='#F7D8C9'; BOOK='#F6E4CB'; PAGE='#FBEFDD'

def spline(pts, move=True, t=0.5):
    """Catmull-Rom through pts -> cubic Bezier path data."""
    d=[f'M{pts[0][0]} {pts[0][1]}'] if move else []
    n=len(pts)
    for i in range(n-1):
        p0=pts[i-1] if i>0 else pts[i]; p1=pts[i]; p2=pts[i+1]; p3=pts[i+2] if i+2<n else pts[i+1]
        c1=(p1[0]+(p2[0]-p0[0])*t/3*2, p1[1]+(p2[1]-p0[1])*t/3*2) if False else (p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6)
        c2=(p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6)
        d.append(f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]} {p2[1]}')
    return ' '.join(d)

A1=[(400,318),(375,285),(335,225),(290,165),(230,110),(175,93),(140,105),(124,145),(130,195),(170,265),(240,325),(295,352)]
A2=[(295,352),(255,395),(232,450),(228,500),(239,549),(257,588),(250,626),(215,672),(180,732),(160,800),(165,870),(195,928),(250,962),(330,972),(400,963),(432,949)]
B1=[(357,247),(336,178),(330,112),(350,80),(385,72),(430,95),(475,160),(497,220),(507,260),(515,300),(517,317)]
B2=[(517,317),(533,330),(550,343),(568,360),(582,380),(592,400),(599,420),(605,440),(608,460),(615,480),(623,500),(628,520),(627,540),(618,560),(601,583),(575,606),(540,626),(490,640)]

def bunny(sw=11.5, scale=0.395, bg=BG, fur=FUR):
    st=f'fill="none" stroke="{LINE}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"'
    s=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">', f'<rect width="512" height="512" fill="{bg}"/>',
       f'<g transform="translate(256 256) scale({scale}) translate(-421.5 -528.5)">']
    fill = spline(A1) + ' ' + spline(A2, move=False) + ' L560 935 L560 655 L490 640 ' + spline(B2[::-1], move=False) + ' ' + spline(B1[::-1], move=False) + ' Z'
    s.append(f'<path d="{fill}" fill="{fur}"/>')
    s.append(f'<ellipse cx="265" cy="243" rx="32" ry="104" transform="rotate(-43 265 243)" fill="{PEACH}"/>')
    s.append(f'<ellipse cx="426" cy="222" rx="29" ry="87" transform="rotate(-14 426 222)" fill="{PEACH}"/>')
    s.append(f'<path d="{spline(B1)} {spline(B2, move=False)}" {st}/>')
    s.append(f'<path d="{spline(A1)} {spline(A2, move=False)}" {st}/>')
    # face
    s.append(f'<ellipse cx="388" cy="540" rx="30" ry="18" fill="{BLUSH}"/><ellipse cx="601" cy="513" rx="17" ry="17" fill="{BLUSH}"/>')
    s.append(f'<circle cx="422" cy="495" r="18" fill="{LINE}"/><circle cx="567" cy="477" r="18" fill="{LINE}"/>')
    s.append(f'<path d="M496 523 L540 567 M540 523 L496 567" fill="none" stroke="{LINE}" stroke-width="{sw*0.85:.1f}" stroke-linecap="round"/>')
    # book
    s.append(f'<path d="M545 692 C570 655 630 618 680 592 L684 630 L545 700 Z" fill="{PAGE}" stroke="{LINE}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"/>')
    s.append(f'<path d="M530 705 L718 620 L705 890 L530 985 Z" fill="{BOOK}" stroke="{LINE}" stroke-width="{sw}" stroke-linejoin="round"/>')
    s.append(f'<path d="M322 632 L530 705 L530 985 L322 905 Z" fill="{BOOK}" stroke="{LINE}" stroke-width="{sw}" stroke-linejoin="round"/>')
    s.append(f'<path d="M575 755 L680 708 M608 778 L652 758" fill="none" stroke="{LINE}" stroke-width="{sw*0.85:.1f}" stroke-linecap="round"/>')
    s.append('</g></svg>'); return '\n'.join(s)

if __name__=='__main__':
    open('bunny2.svg','w').write(bunny())
    for sz in (512,180,60,32): subprocess.run(['rsvg-convert','-w',str(sz),'-h',str(sz),'bunny2.svg','-o',f'bunny2_{sz}.png'],check=True)
    from PIL import Image, ImageDraw
    ref=Image.open('/mnt/user-data/uploads/ca3d5c46-image.jpg').convert('RGB').crop((50,30,395,372)).resize((400,397),Image.LANCZOS)
    out=Image.new('RGB',(1280,500),'#dddddd'); out.paste(ref,(20,20))
    im=Image.open('bunny2_512.png').convert('RGB').resize((400,400),Image.LANCZOS)
    m=Image.new('L',(400,400),0); ImageDraw.Draw(m).rounded_rectangle((0,0,399,399),radius=90,fill=255); out.paste(im,(440,20),m)
    m=Image.new('L',(400,400),0); ImageDraw.Draw(m).ellipse((0,0,399,399),fill=255); out.paste(im,(860,20),m)
    sm=Image.open('bunny2_60.png').convert('RGB'); m2=Image.new('L',(60,60),0); ImageDraw.Draw(m2).rounded_rectangle((0,0,59,59),radius=14,fill=255); out.paste(sm,(440,432),m2)
    out.paste(Image.open('bunny2_32.png').convert('RGB'),(520,446))
    out.save('sheet6.png')
