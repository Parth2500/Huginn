import {
  Component,
  ElementRef,
  Inject,
  Input,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { combineLatest, map, Observable, startWith, tap } from 'rxjs';
import { IMessage, IMessagePaginate } from 'src/app/models/message.interface';
import { IRoom } from 'src/app/models/room.interface';
import {
  ChatToken,
  IChatService,
} from '../../services/iservices/chat.service.interface';

@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
})
export class ChatRoomComponent {
  @Input() chatRoom: IRoom;
  @ViewChild('messages') private messagesScroller: ElementRef;

  messagesPaginate$: Observable<IMessagePaginate> = combineLatest([
    this.chatService.getMessages(),
    this.chatService.getAddedMessage().pipe(startWith(null)),
  ]).pipe(
    map(([messagePaginate, message]) => {
      if (
        message &&
        message.room.id === this.chatRoom.id &&
        !messagePaginate.items.some((m) => m.id === message.id)
      ) {
        messagePaginate.items.push(message);
      }
      messagePaginate.items.sort((a, b) => {
        if (a.created_at instanceof Date && b.created_at instanceof Date) {
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
        return (
          new Date(a.created_at as Date).getTime() -
          new Date(b.created_at as Date).getTime()
        );
      });
      return messagePaginate;
    }),
    tap(() => this.scrollToBottom())
  );

  chatMessage: FormControl = new FormControl(null, [Validators.required]);

  constructor(@Inject(ChatToken) private chatService: IChatService) {}

  ngOnChanges(changes: SimpleChanges) {
    this.chatService.leaveRoom(changes['chatRoom'].previousValue);
    if (this.chatRoom) {
      this.chatService.joinRoom(this.chatRoom);
    }
  }

  ngAfterViewInit() {
    if (this.messagesScroller) {
      this.scrollToBottom();
    }
  }

  ngOnDestroy() {
    this.chatService.leaveRoom(this.chatRoom);
  }

  sendMessage() {
    this.chatService.sendMessage({
      text: this.chatMessage.value,
      room: this.chatRoom,
    });
    this.chatMessage.reset();
  }

  scrollToBottom(): void {
    try {
      setTimeout(() => {
        this.messagesScroller.nativeElement.scrollTop =
          this.messagesScroller.nativeElement.scrollHeight;
      }, 1);
    } catch {}
  }
}
