import { useEffect, useRef, useState, type ComponentProps, type Ref } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getAutocomplete } from '@/api/endpoints';
import { colors, radii, shadows, spacing, typography } from '@/theme';

import type { AddressSuggestion } from '@/api/types';

type AddressAutocompleteFieldProps = ComponentProps<typeof TextInput> & { ref?: Ref<TextInput> };

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

function newSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Address text field with a Places Autocomplete dropdown, backed by the server's
 * `/autocomplete` proxy (never calls Google directly — see server/API.md). Falls
 * back to a plain text field if the request fails (e.g. demo-data mode with no
 * server running): the dropdown just stays empty and typing still works.
 */
export function AddressAutocompleteField({
  value,
  onChangeText,
  onFocus,
  onBlur,
  ...props
}: AddressAutocompleteFieldProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionToken = useRef(newSessionToken());
  const skipNextFetch = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    const query = typeof value === 'string' ? value.trim() : '';
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { suggestions: results } = await getAutocomplete(query, sessionToken.current);
        if (id === requestId.current) setSuggestions(results);
      } catch {
        if (id === requestId.current) setSuggestions([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value]);

  const handleSelect = (suggestion: AddressSuggestion) => {
    skipNextFetch.current = true;
    setSuggestions([]);
    onChangeText?.(suggestion.text);
    sessionToken.current = newSessionToken();
  };

  const showDropdown = focused && (loading || suggestions.length > 0);

  return (
    <View style={[styles.container, showDropdown && styles.containerRaised]}>
      <TextInput
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        autoCapitalize="words"
        selectTextOnFocus
        value={value}
        onChangeText={onChangeText}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={styles.input}
        {...props}
      />
      {showDropdown && (
        <View style={[styles.dropdown, shadows.floating]}>
          <ScrollView keyboardShouldPersistTaps="always" style={styles.dropdownScroll}>
            {suggestions.map((item) => (
              <Pressable
                key={item.placeId}
                style={({ pressed }) => [styles.suggestionRow, pressed && styles.suggestionRowPressed]}
                onPress={() => handleSelect(item)}
              >
                <Text style={styles.suggestionMain} numberOfLines={1}>
                  {item.mainText}
                </Text>
                {item.secondaryText ? (
                  <Text style={styles.suggestionSecondary} numberOfLines={1}>
                    {item.secondaryText}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            {loading && suggestions.length === 0 && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.textMuted} />
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', zIndex: 1 },
  containerRaised: { zIndex: 30 },
  input: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    zIndex: 30,
  },
  dropdownScroll: { maxHeight: 220 },
  suggestionRow: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  suggestionRowPressed: { backgroundColor: colors.surfacePressed },
  suggestionMain: { ...typography.body },
  suggestionSecondary: { ...typography.caption },
  loadingRow: { paddingVertical: spacing.md, alignItems: 'center' },
});
