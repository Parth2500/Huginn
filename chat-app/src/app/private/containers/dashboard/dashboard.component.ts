import { AfterViewInit, Component, Inject, OnInit } from '@angular/core';
import { MatSelectionListChange } from '@angular/material/list';
import { PageEvent } from '@angular/material/paginator';
import { Observable } from 'rxjs';
import { IRoom, IRoomPaginate } from 'src/app/models/room.interface';
import { IUser } from 'src/app/models/user.interface';
import {
  ISignOnService,
  SignOnToken,
} from 'src/app/public/services/iservices/sign-on.service.interface';
import {
  ChatToken,
  IChatService,
} from '../../services/iservices/chat.service.interface';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, AfterViewInit {
  rooms$: Observable<IRoomPaginate> = this.chatService.getMyRooms() ?? {};
  selectedRoom: IRoom;
  user: IUser = this.signOnService.getLoggedInUser();

  constructor(
    @Inject(ChatToken) private chatService: IChatService,
    @Inject(SignOnToken) private signOnService: ISignOnService
  ) {}

  ngOnInit() {
    this.chatService.emitPaginateRooms(10, 0);
  }

  ngAfterViewInit() {
    this.chatService.emitPaginateRooms(10, 0);
  }

  onSelectRoom(event: MatSelectionListChange) {
    this.selectedRoom = event.source.selectedOptions.selected[0].value;
  }

  onPaginateRooms(pageEvent: PageEvent) {
    this.chatService.emitPaginateRooms(pageEvent.pageSize, pageEvent.pageIndex);
  }
}
