import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Modal as RNModal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveServerUrl } from '@/api/client';
import { DESTINATION_GUIDE } from '@/config';
import type { DestinationGuide, DestinationGuideMessage } from '@/features/destination/useDestinationGuide';
import { formatDistance, formatRating } from '@/lib/format';
import { colors, radii, spacing, typography } from '@/theme';

import { useKeyboardHeight } from '../chat/GuideChatModal';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';

import type { GuidePlaceCard } from '@/api/types';

interface DestinationGuideModalProps {
  visible: boolean;
  guide: DestinationGuide;
  onClose: () => void;
}

/**
 * "Where to?" guide: a short chat that helps pick a destination. Replies, then
 * the latest place cards and quick-reply chips under them, then an input bar.
 * Same look as the Ask Guide chat (GuideChatModal).
 */
export function DestinationGuideModal({ visible, guide, onClose }: DestinationGuideModalProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<DestinationGuideMessage>>(null);
  const keyboardHeight = useKeyboardHeight();
  const { messages, chips, places, sending } = guide;

  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messages.length, places.length, chips.length, sending, visible, keyboardHeight]);

  useEffect(() => {
    if (!visible) setDraft('');
  }, [visible]);

  const canSend = draft.trim().length > 0 && !sending;
  const submit = () => {
    if (!canSend) return;
    guide.send(draft);
    setDraft('');
  };

  const footer = sending ? (
    <TypingBubble />
  ) : (
    <View style={styles.footer}>
      {places.length > 0 && (
        <View style={styles.cards}>
          {places.map((place, i) => (
            <PlaceCard key={place.placeId} place={place} index={i} onPress={() => guide.tapPlace(place)} />
          ))}
        </View>
      )}
      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <Chip key={chip.id} label={chip.label} onPress={() => guide.tapChip(chip)} />
          ))}
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} onClose={onClose}>
      <View style={styles.navBar}>
        <View style={styles.navSide} />
        <View style={styles.navTitle}>
          <Text style={styles.title}>Where to?</Text>
          <Text style={typography.caption}>Let's find somewhere great</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" style={styles.navSide}>
          <Text style={styles.done}>Cancel</Text>
        </Pressable>
      </View>

      <View style={[styles.flex, { paddingBottom: keyboardHeight }]}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.list}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={footer}
        />

        <View style={[styles.inputBar, { paddingBottom: keyboardHeight ? spacing.sm : Math.max(insets.bottom, spacing.sm) }]}>
          <View style={styles.inputWrap}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Tell me what you're in the mood for…"
              placeholderTextColor={colors.textMuted}
              maxLength={DESTINATION_GUIDE.maxMessageChars}
              returnKeyType="send"
              onSubmitEditing={submit}
              style={styles.input}
              accessibilityLabel="Message to the guide"
            />
          </View>
          <Pressable
            onPress={submit}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend }}
            style={[styles.sendButton, !canSend && styles.sendDisabled]}
          >
            <Icon name="send" size={18} color={colors.textInverse} style={styles.sendIcon} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** iOS page sheet, like the Ask Guide chat. */
function Modal({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <RNModal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>{children}</View>
    </RNModal>
  );
}

function MessageBubble({ message }: { message: DestinationGuideMessage }) {
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
        <Text style={[styles.bubbleText, mine && { color: colors.textInverse }, message.error && { color: colors.danger }]}>
          {message.text}
        </Text>
      </View>
    </View>
  );
}

function PlaceCard({ place, index, onPress }: { place: GuidePlaceCard; index: number; onPress: () => void }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const details = [
    formatDistance(place.distanceMeters),
    formatRating(place.rating, place.userRatingCount),
    place.openNow ? 'Open now' : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${index + 1}. ${place.name}, ${details.join(', ')}`}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      {place.photoUrl && !photoFailed ? (
        <Image
          source={{ uri: `${resolveServerUrl(place.photoUrl)}&maxWidthPx=200` }}
          style={styles.photo}
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]}>
          <Text style={styles.photoIndex}>{index + 1}</Text>
        </View>
      )}
      <View style={styles.cardText}>
        <Text style={styles.cardName} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={styles.cardDetails} numberOfLines={1}>
          {details.join(' · ')}
        </Text>
        {!!place.address && (
          <Text style={typography.caption} numberOfLines={1}>
            {place.address}
          </Text>
        )}
      </View>
      <Icon name="chevronRight" size={22} color={colors.textMuted} />
    </Pressable>
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

// iOS Messages colors, as in GuideChatModal.
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
  footer: { gap: spacing.md },
  cards: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  photo: { width: 56, height: 56, borderRadius: radii.sm, backgroundColor: colors.border },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  photoIndex: { fontSize: 18, fontWeight: '700', color: colors.textMuted },
  cardText: { flex: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardDetails: { fontSize: 13, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  input: { fontSize: 16, paddingTop: 8, paddingBottom: 8, color: colors.text },
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
