import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHAT } from '@/config';
import type { ChatMessage, GuideChat } from '@/features/chat/useGuideChat';
import { colors, radii, spacing, typography } from '@/theme';

import { Icon } from '../ui/Icon';

interface GuideChatModalProps {
  visible: boolean;
  chat: GuideChat;
  onClose: () => void;
}

/** iOS page-sheet chat with the guide: message list, sources under replies, input bar. */
export function GuideChatModal({ visible, chat, onClose }: GuideChatModalProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const { messages, sending, send } = chat;
  const keyboardHeight = useKeyboardHeight();

  // Newest message at the bottom; keep it in view as replies arrive and when the keyboard opens.
  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messages.length, sending, visible, keyboardHeight]);

  const canSend = draft.trim().length > 0 && !sending;
  const submit = () => {
    if (!canSend) return;
    send(draft);
    setDraft('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.navBar}>
          <View style={styles.navSide} />
          <View style={styles.navTitle}>
            <Text style={styles.title}>Ask Guide</Text>
            <Text style={typography.caption}>Your scenic copilot</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" style={styles.navSide}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        {/* Not KeyboardAvoidingView: it under-measures inside a pageSheet modal and the keyboard hid the input. */}
        <View style={[styles.flex, { paddingBottom: keyboardHeight }]}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.list}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={sending ? <TypingBubble /> : null}
          />

          <View style={[styles.inputBar, { paddingBottom: keyboardHeight ? spacing.sm : Math.max(insets.bottom, spacing.sm) }]}>
            <View style={styles.inputWrap}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask about a place…"
                placeholderTextColor={colors.textMuted}
                maxLength={CHAT.maxMessageChars}
                multiline
                style={styles.input}
                accessibilityLabel="Message to the guide"
              />
              {draft.length > CHAT.maxMessageChars - 100 && (
                <Text style={styles.counter}>
                  {draft.length}/{CHAT.maxMessageChars}
                </Text>
              )}
            </View>
            <Pressable
              onPress={submit}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={[styles.sendButton, !canSend && styles.sendDisabled]}
            >
              <Icon name="send" size={18} color={colors.textInverse} style={styles.sendIcon} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user';
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <View
        style={[
          styles.bubble,
          mine ? styles.bubbleMine : styles.bubbleTheirs,
          message.error && { backgroundColor: colors.dangerSoft },
        ]}
      >
        <Text
          style={[styles.bubbleText, mine && { color: colors.textInverse }, message.error && { color: colors.danger }]}
          selectable
        >
          {message.text}
        </Text>
      </View>
      {message.placeName && <Text style={styles.about}>About {message.placeName}</Text>}
      {!!message.sources?.length && (
        <View style={styles.sources}>
          {message.sources.map((source) => (
            <Pressable
              key={source.url}
              onPress={() => Linking.openURL(source.url).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel={`Open source: ${source.title}`}
              style={({ pressed }) => [styles.sourcePill, pressed && { backgroundColor: colors.surfacePressed }]}
            >
              <Text style={styles.sourceText} numberOfLines={1}>
                {source.title || hostOf(source.url)}
              </Text>
              <Icon name="link" size={11} color={colors.userPuck} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function TypingBubble() {
  return (
    <View style={[styles.row, styles.rowTheirs]}>
      <View style={[styles.bubble, styles.bubbleTheirs, styles.typing]}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={typography.caption}>Guide is typing…</Text>
      </View>
    </View>
  );
}

/**
 * How much of the screen the keyboard covers, from iOS's own keyboard frame.
 * The page sheet reaches the bottom of the screen, so that is exactly how far
 * the input bar has to move up. Animated with the keyboard's own curve.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const update = (next: number, duration: number) => {
      if (duration > 0) {
        LayoutAnimation.configureNext(
          LayoutAnimation.create(duration, LayoutAnimation.Types.keyboard, LayoutAnimation.Properties.opacity),
        );
      }
      setHeight(next);
    };
    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      update(Math.max(0, Dimensions.get('screen').height - e.endCoordinates.screenY), e.duration);
    });
    const hide = Keyboard.addListener('keyboardWillHide', (e) => update(0, e.duration));
    return () => {
      change.remove();
      hide.remove();
    };
  }, []);
  return height;
}

function hostOf(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
}

// iOS Messages colors: system blue for you, system gray 6 for the guide.
const IOS_BLUE = colors.userPuck;
const IOS_GRAY = '#E9E9EB';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  navSide: { width: 60, alignItems: 'flex-end' },
  navTitle: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  done: { fontSize: 17, fontWeight: '600', color: IOS_BLUE },
  list: { padding: spacing.lg, gap: spacing.md },
  row: { maxWidth: '80%', gap: spacing.xs },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: IOS_BLUE, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: IOS_GRAY, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 16, lineHeight: 21, color: colors.text },
  typing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  about: { ...typography.caption, fontSize: 12, marginLeft: spacing.xs },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 220,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  sourceText: { fontSize: 12, fontWeight: '500', color: IOS_BLUE, flexShrink: 1 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  inputWrap: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C7C7CC',
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  input: { fontSize: 16, maxHeight: 120, paddingTop: 8, paddingBottom: 8, color: colors.text },
  counter: { ...typography.caption, fontSize: 11, alignSelf: 'flex-end', paddingBottom: 4 },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: IOS_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.35 },
  sendIcon: { fontWeight: '700' },
});
