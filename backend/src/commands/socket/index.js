/**
 * @fileoverview Registry de comandos Socket.IO.
 */

const JoinPlayCommand = require('./JoinPlayCommand');
const LeavePlayCommand = require('./LeavePlayCommand');
const StartPlayCommand = require('./StartPlayCommand');
const PausePlayCommand = require('./PausePlayCommand');
const ResumePlayCommand = require('./ResumePlayCommand');
const NextRoundCommand = require('./NextRoundCommand');
const JoinCardRegistrationCommand = require('./JoinCardRegistrationCommand');
const LeaveCardRegistrationCommand = require('./LeaveCardRegistrationCommand');
const JoinCardAssignmentCommand = require('./JoinCardAssignmentCommand');
const LeaveCardAssignmentCommand = require('./LeaveCardAssignmentCommand');
const JoinAdminRoomCommand = require('./JoinAdminRoomCommand');
const LeaveAdminRoomCommand = require('./LeaveAdminRoomCommand');
const RfidScanFromClientCommand = require('./RfidScanFromClientCommand');

const commands = {
  join_play: new JoinPlayCommand(),
  leave_play: new LeavePlayCommand(),
  start_play: new StartPlayCommand(),
  pause_play: new PausePlayCommand(),
  resume_play: new ResumePlayCommand(),
  next_round: new NextRoundCommand(),
  join_card_registration: new JoinCardRegistrationCommand(),
  leave_card_registration: new LeaveCardRegistrationCommand(),
  join_card_assignment: new JoinCardAssignmentCommand(),
  leave_card_assignment: new LeaveCardAssignmentCommand(),
  join_admin_room: new JoinAdminRoomCommand(),
  leave_admin_room: new LeaveAdminRoomCommand(),
  rfid_scan_from_client: new RfidScanFromClientCommand()
};

const getSocketCommand = eventName => commands[eventName] || null;

const getCommandNames = () => Object.keys(commands);

module.exports = {
  getSocketCommand,
  getCommandNames
};
