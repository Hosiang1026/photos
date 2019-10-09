import random
def swap (t1,t2):
  return t2,t1
f=open("in.txt","w")
n=10
m=10
print>>f,'{} {}'.format(n,m)
for i in range(1,n):
  print>>f,random.randint(1,10),
print>>f,''
for i in range(1,m):
  op=random.randint(1,2)
  l=random.randint(1,n)
  if op==1:
    r=random.randint(1,n)
    if l>r:
      l,r=swap(l,r)
  else :
    r=random.randint(1,10)
  print>>f,'{} {} {}'.format(op,l,r)
f.close()