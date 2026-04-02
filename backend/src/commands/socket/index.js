/**
 * @fileoverview Registry de comandos Socket.IO.
 */

const JoinPlayCommand = require('./JoinPlayCommand');
const LeavePlayCommand = require('./LeavePlayCommand');
const StartPlayCommand = require('./StartPlayCommand');
const PausePlayCommand = require('./PausePlayCommand');
const ResumePlayCommand = require('./ResumePlayCommand');
const NextRoundCommand = require('./NextRoundCommand');
const JoinCardAssignmentCommand = require('./JoinCardAssignmentCommand');
const LeaveCardAssignmentCommand = require('./LeaveCardAssignmentCommand');
const JoinAdminRoomCommand = require('./JoinAdminRoomCommand');
const LeaveAdminRoomCommand = require('./LeaveAdminRoomCommand');
const RfidScanFromClientCommand = require('./RfidScanFromClientCommand');
const PlayStateSyncCommand = require('./PlayStateSyncCommand');
const BoardReadyCommand = require('./BoardReadyCommand');

const commands = {
  join_play: new JoinPlayCommand(),
  leave_play: new LeavePlayCommand(),
  start_play: new StartPlayCommand(),
  pause_play: new PausePlayCommand(),
  resume_play: new ResumePlayCommand(),
  next_round: new NextRoundCommand(),
  join_card_assignment: new JoinCardAssignmentCommand(),
  leave_card_assignment: new LeaveCardAssignmentCommand(),
  join_admin_room: new JoinAdminRoomCommand(),
  leave_admin_room: new LeaveAdminRoomCommand(),
  rfid_scan_from_client: new RfidScanFromClientCommand(),
  play_state_sync: new PlayStateSyncCommand(),
  board_ready: new BoardReadyCommand()
};

const getSocketCommand = eventName => commands[eventName] || null;

const getCommandNames = () => Object.keys(commands);

module.exports = {
  getSocketCommand,
  getCommandNames
};
