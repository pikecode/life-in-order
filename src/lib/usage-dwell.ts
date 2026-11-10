export class VisibleDwell {
  private elapsed=0;
  private activeAt:number|null=null;
  private reported=false;
  tick(active:boolean,at:number) {
    if(this.activeAt!==null) this.elapsed+=Math.max(0,at-this.activeAt);
    this.activeAt=active?at:null;
    if(!this.reported && this.elapsed>=10000) { this.reported=true;return true; }
    return false;
  }
}
